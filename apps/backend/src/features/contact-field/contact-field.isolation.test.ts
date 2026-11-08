import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';

// Mock de las colas BullMQ: evita conexión a Redis al importar `app`.
vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import app from '../../app.js';
import { Cliente } from '../cliente/cliente.model.js';
import { ContactField } from './contact-field.model.js';
import { backfillContactFieldsDeTenant } from '../../seed/backfill-contact-fields.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';

function makeToken(tenantId: string, rol = 'admin'): string {
  return jwt.sign(
    { sub: new Types.ObjectId().toString(), tenantId, email: 'u@e.com', nombre: 'U', rol, activo: true },
    SECRET,
    { expiresIn: '1h' },
  );
}

function llamar(method: 'get' | 'post' | 'patch' | 'delete', token: string, url: string): request.Test {
  return request(app)[method](url)
    .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF);
}

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();
const tokenA = makeToken(tenantA.toString());
const tokenB = makeToken(tenantB.toString());

beforeEach(async () => {
  await ContactField.deleteMany({});
  await ContactField.syncIndexes();
  await Cliente.deleteMany({});
});

describe('/api/campos-contacto — aislamiento multi-tenant (HU-FLOW-05, criterio 36)', () => {
  it('un campo del tenant A no se lista desde el B', async () => {
    await llamar('post', tokenA, '/api/campos-contacto').send({ label: 'Colegio', tipoDato: 'texto' }).expect(201);

    const desdeB = await llamar('get', tokenB, '/api/campos-contacto').expect(200);
    expect(desdeB.body).toEqual([]);
    const desdeA = await llamar('get', tokenA, '/api/campos-contacto').expect(200);
    expect(desdeA.body).toHaveLength(1);
  });

  it('un campo del tenant A no se edita ni se archiva desde el B: 404, indistinguible de inexistente', async () => {
    const creado = await llamar('post', tokenA, '/api/campos-contacto')
      .send({ label: 'Colegio', tipoDato: 'texto' })
      .expect(201);

    await llamar('patch', tokenB, `/api/campos-contacto/${creado.body.id}`).send({ label: 'Secuestrado' }).expect(404);
    await llamar('delete', tokenB, `/api/campos-contacto/${creado.body.id}`).expect(404);

    const intacto = await ContactField.findById(creado.body.id).lean();
    expect(intacto?.label).toBe('Colegio');
    expect(intacto?.activo).toBe(true);
  });

  it('la misma etiqueta puede existir en dos tenants sin chocar', async () => {
    await llamar('post', tokenA, '/api/campos-contacto').send({ label: 'Colegio', tipoDato: 'texto' }).expect(201);
    await llamar('post', tokenB, '/api/campos-contacto').send({ label: 'Colegio', tipoDato: 'texto' }).expect(201);
    expect(await ContactField.countDocuments({})).toBe(2);
  });

  it('el backfill de un tenant no crea campos en otro', async () => {
    await createScoped(Cliente, tenantA, {
      metaUserId: 'wa_a',
      telefono: '573000000001',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tagIds: [],
      atributos: [{ key: 'colegio', label: 'Colegio', valor: 'Libertad', sensible: false }],
    });

    expect(await backfillContactFieldsDeTenant(tenantA)).toBe(1);

    expect(await ContactField.countDocuments({ tenantId: tenantA })).toBe(1);
    expect(await ContactField.countDocuments({ tenantId: tenantB })).toBe(0);
  });

  it('el rol superadmin (sin tenant) y los no admin no acceden → 403', async () => {
    await llamar('get', makeToken(tenantA.toString(), 'superadmin'), '/api/campos-contacto').expect(403);
  });

  it('sin sesión → 401', async () => {
    await request(app).get('/api/campos-contacto').expect(401);
  });
});

describe('POST /api/campos-contacto — contrato HTTP', () => {
  it('el nombre reservado → 400; la clave en el body se rechaza (.strict())', async () => {
    await llamar('post', tokenA, '/api/campos-contacto').send({ label: 'Email', tipoDato: 'texto' }).expect(400);
    await llamar('post', tokenA, '/api/campos-contacto')
      .send({ label: 'Colegio', tipoDato: 'texto', key: 'email' })
      .expect(400);
  });

  it('DELETE archiva y responde 204; el campo sigue disponible con `incluirArchivados`', async () => {
    const creado = await llamar('post', tokenA, '/api/campos-contacto')
      .send({ label: 'Colegio', tipoDato: 'texto' })
      .expect(201);
    await llamar('delete', tokenA, `/api/campos-contacto/${creado.body.id}`).expect(204);

    expect((await llamar('get', tokenA, '/api/campos-contacto').expect(200)).body).toHaveLength(0);
    const todos = await llamar('get', tokenA, '/api/campos-contacto?incluirArchivados=true').expect(200);
    expect(todos.body).toEqual([expect.objectContaining({ key: 'colegio', activo: false })]);
  });
});
