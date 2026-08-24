import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

// Mock de las colas BullMQ: evita conexión a Redis al importar `app`.
vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  AI_REPLY_QUEUE_NAME: 'ai-reply',
  AI_REPLY_JOB_NAME: 'auto-reply',
  inboundQueue: { add: vi.fn() },
  aiReplyQueue: { add: vi.fn().mockResolvedValue(undefined) },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import app from '../../app.js';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { User } from '../users/user.model.js';
import { Lead } from './lead.model.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';

const ACTOR = '507f1f77bcf86cd799439012';

function makeToken(tenantId: string | null, rol: string): string {
  return jwt.sign(
    { sub: ACTOR, tenantId, email: 'u@e.com', nombre: 'U', rol, activo: true },
    SECRET,
    { expiresIn: '1h' },
  );
}

/** POST pasa por el guard CSRF (double-submit): cookie legible + header con el mismo valor. */
function post(token: string, body: Record<string, unknown>): request.Test {
  return request(app)
    .post('/api/leads')
    .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF)
    .send(body);
}

/** DELETE también pasa por el guard CSRF. El motivo viaja en la query, no en el cuerpo. */
function del(token: string, id: string, motivo?: string): request.Test {
  const url = motivo ? `/api/leads/${id}?motivo=${motivo}` : `/api/leads/${id}`;
  return request(app)
    .delete(url)
    .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF);
}

async function crearCliente(tenantId: Types.ObjectId): Promise<string> {
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: 'wa_routes',
    telefono: '573001112233',
    nombre: 'Ana',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
  });
  return String(doc._id);
}

describe('POST /api/leads — cadena de middlewares y contrato HTTP', () => {
  let tenantId: Types.ObjectId;
  let clienteId: string;

  beforeEach(async () => {
    await Lead.deleteMany({});
    await Cliente.deleteMany({});
    await User.deleteMany({});
    await Lead.syncIndexes();

    tenantId = new Types.ObjectId();
    clienteId = await crearCliente(tenantId);
    await createScoped(User, tenantId, {
      _id: new Types.ObjectId(ACTOR),
      nombre: 'Carolina',
      email: 'carolina@empresa.test',
      passwordHash: 'x',
      rol: 'admin',
      activo: true,
    });
  });

  it('sin CSRF → 403 antes de llegar a autenticar', async () => {
    // `csrfGuard` es middleware de app y corre ANTES de la cadena de la ruta, así que un POST sin
    // el double-submit nunca alcanza `authenticateJWT`.
    const res = await request(app).post('/api/leads').send({});
    expect(res.status).toBe(403);
  });

  it('con CSRF pero sin JWT → 401 (la ruta está montada y autentica)', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Cookie', `csrfToken=${CSRF}`)
      .set('X-CSRF-Token', CSRF)
      .send({});
    expect(res.status).toBe(401);
  });

  it('rol superadmin (no admin) → 403', async () => {
    const res = await post(makeToken(tenantId.toString(), 'superadmin'), {
      nombre: 'Ana',
      telefono: '573001112233',
      clienteId,
    });
    expect(res.status).toBe(403);
  });

  it('body inválido → 400 con el detalle de Zod', async () => {
    const res = await post(makeToken(tenantId.toString(), 'admin'), { nombre: '', telefono: '1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Error de validación.');
  });

  it('admin → 201 con el lead y su trazabilidad', async () => {
    const res = await post(makeToken(tenantId.toString(), 'admin'), {
      nombre: 'Ana Pérez',
      telefono: '+57 300 111 2233',
      clienteId,
    });

    expect(res.status).toBe(201);
    // El teléfono llega normalizado a solo dígitos.
    expect(res.body.telefono).toBe('573001112233');
    expect(res.body.estado).toBe('nuevo');
    expect(res.body.contacto.id).toBe(clienteId);
    expect(res.body.origen.conversacionId).toBe(clienteId);
    expect(res.body.origen.convertidoPor).toEqual({ id: ACTOR, nombre: 'Carolina' });
  });

  it('duplicado → 409 y el `leadId` existente LLEGA en el cuerpo (AppError.details)', async () => {
    const token = makeToken(tenantId.toString(), 'admin');
    const primero = await post(token, { nombre: 'Ana', telefono: '573001112233', clienteId });
    expect(primero.status).toBe(201);

    const segundo = await post(token, { nombre: 'Ana otra vez', telefono: '573001112233', clienteId });
    expect(segundo.status).toBe(409);
    expect(segundo.body.message).toBe('Ya existe un lead con ese teléfono.');
    // Sin esto la UI no podría ofrecer "Ver lead existente".
    expect(segundo.body.leadId).toBe(primero.body.id);
  });
});

describe('GET /api/leads/:id', () => {
  it('sin JWT → 401', async () => {
    const res = await request(app).get(`/api/leads/${new Types.ObjectId().toString()}`);
    expect(res.status).toBe(401);
  });

  it('id con formato inválido → 400', async () => {
    const res = await request(app)
      .get('/api/leads/no-es-un-objectid')
      .set('Cookie', `token=${makeToken(new Types.ObjectId().toString(), 'admin')}`);
    expect(res.status).toBe(400);
  });

  it('un lead de otro tenant → 404, nunca 403', async () => {
    const tenantA = new Types.ObjectId();
    const clienteA = await crearCliente(tenantA);
    const creado = await createScoped(Lead, tenantA, {
      nombre: 'Solo de A',
      telefono: '573004445566',
      clienteId: new Types.ObjectId(clienteA),
      responsableId: new Types.ObjectId(ACTOR),
      estado: 'nuevo',
      origen: {
        tipo: 'conversacion',
        conversacionId: new Types.ObjectId(clienteA),
        convertidoPor: new Types.ObjectId(ACTOR),
        convertidoAt: new Date(),
      },
    });

    const res = await request(app)
      .get(`/api/leads/${String(creado._id)}`)
      .set('Cookie', `token=${makeToken(new Types.ObjectId().toString(), 'admin')}`);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/leads/:id — borrado con motivo obligatorio', () => {
  let tenantId: Types.ObjectId;
  let clienteId: string;
  let token: string;

  async function crearLead(owner: Types.ObjectId, cliente: string): Promise<string> {
    const doc = await createScoped(Lead, owner, {
      nombre: 'Ana Pérez',
      telefono: '573001112233',
      clienteId: new Types.ObjectId(cliente),
      responsableId: new Types.ObjectId(ACTOR),
      estado: 'nuevo',
      origen: {
        tipo: 'conversacion',
        conversacionId: new Types.ObjectId(cliente),
        convertidoPor: new Types.ObjectId(ACTOR),
        convertidoAt: new Date(),
      },
    });
    return String(doc._id);
  }

  beforeEach(async () => {
    await Lead.deleteMany({});
    await Cliente.deleteMany({});
    await User.deleteMany({});
    await Lead.syncIndexes();

    tenantId = new Types.ObjectId();
    clienteId = await crearCliente(tenantId);
    token = makeToken(tenantId.toString(), 'admin');
  });

  it('sin CSRF → 403 antes de llegar a autenticar', async () => {
    const res = await request(app).delete(`/api/leads/${new Types.ObjectId().toString()}`);
    expect(res.status).toBe(403);
  });

  it('con CSRF pero sin JWT → 401', async () => {
    const res = await request(app)
      .delete(`/api/leads/${new Types.ObjectId().toString()}?motivo=spam`)
      .set('Cookie', `csrfToken=${CSRF}`)
      .set('X-CSRF-Token', CSRF);
    expect(res.status).toBe(401);
  });

  it('rol superadmin (no admin) → 403', async () => {
    const id = await crearLead(tenantId, clienteId);
    const res = await del(makeToken(tenantId.toString(), 'superadmin'), id, 'spam');
    expect(res.status).toBe(403);
  });

  it('sin motivo → 400: el borrado nunca queda sin explicación', async () => {
    const id = await crearLead(tenantId, clienteId);
    const res = await del(token, id);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Error de validación.');
    // Y no borró nada.
    expect(await Lead.countDocuments({ _id: new Types.ObjectId(id) })).toBe(1);
  });

  it('motivo fuera del enum → 400', async () => {
    const id = await crearLead(tenantId, clienteId);
    const res = await del(token, id, 'porque-si');

    expect(res.status).toBe(400);
    expect(await Lead.countDocuments({ _id: new Types.ObjectId(id) })).toBe(1);
  });

  it('admin con motivo válido → 204 y el lead desaparece', async () => {
    const id = await crearLead(tenantId, clienteId);
    const res = await del(token, id, 'duplicado');

    expect(res.status).toBe(204);
    expect(await Lead.countDocuments({ _id: new Types.ObjectId(id) })).toBe(0);
  });

  it('los cinco motivos del contrato se aceptan', async () => {
    for (const motivo of ['duplicado', 'spam', 'prueba', 'sin_respuesta', 'no_interesado']) {
      const id = await crearLead(tenantId, clienteId);
      const res = await del(token, id, motivo);
      expect(res.status, `motivo ${motivo}`).toBe(204);
    }
  });

  it('un lead de otro tenant → 404, nunca 403, y sigue existiendo', async () => {
    const tenantA = new Types.ObjectId();
    const clienteA = await crearCliente(tenantA);
    const id = await crearLead(tenantA, clienteA);

    const res = await del(makeToken(new Types.ObjectId().toString(), 'admin'), id, 'spam');

    expect(res.status).toBe(404);
    expect(await Lead.countDocuments({ _id: new Types.ObjectId(id) })).toBe(1);
  });
});
