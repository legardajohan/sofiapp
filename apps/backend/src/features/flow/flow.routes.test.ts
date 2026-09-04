import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

// Mock de las colas BullMQ: evita conexión a Redis al importar `app` (mismo patrón que
// `lead.routes.test.ts`).
vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import app from '../../app.js';
import { Flow } from './flow.model.js';
import { Tenant } from '../tenant/tenant.model.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';

function makeToken(tenantId: string | null, rol: string): string {
  return jwt.sign(
    { sub: new Types.ObjectId().toString(), tenantId, email: 'u@e.com', nombre: 'U', rol, activo: true },
    SECRET,
    { expiresIn: '1h' },
  );
}

const posicion = { x: 0, y: 0 };

function flowValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nombre: 'Flujo de prueba',
    nodos: [{ id: 'n1', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: 'Hola' } }],
    aristas: [],
    entrada: 'n1',
    ...overrides,
  };
}

function post(token: string, body: Record<string, unknown>): request.Test {
  return request(app)
    .post('/api/flows')
    .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF)
    .send(body);
}

function put(token: string, id: string, body: Record<string, unknown>): request.Test {
  return request(app)
    .put(`/api/flows/${id}`)
    .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF)
    .send(body);
}

describe('POST /api/flows — cadena de middlewares y contrato HTTP', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    await Flow.deleteMany({});
    await Flow.syncIndexes();
    tenantId = new Types.ObjectId();
  });

  it('sin sesión → 401 (con CSRF, sin JWT)', async () => {
    const res = await request(app)
      .post('/api/flows')
      .set('Cookie', `csrfToken=${CSRF}`)
      .set('X-CSRF-Token', CSRF)
      .send(flowValido());
    expect(res.status).toBe(401);
  });

  it('sin X-CSRF-Token → 403 antes de llegar a autenticar', async () => {
    const res = await request(app).post('/api/flows').send(flowValido());
    expect(res.status).toBe(403);
  });

  it('rol superadmin (no admin) → 403', async () => {
    const res = await post(makeToken(tenantId.toString(), 'superadmin'), flowValido());
    expect(res.status).toBe(403);
  });

  it('grafo inválido (nodo huérfano) → 400 con el detalle de Zod', async () => {
    const res = await post(
      makeToken(tenantId.toString(), 'admin'),
      flowValido({
        nodos: [
          { id: 'n1', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: 'Hola' } },
          { id: 'huerfano', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: '¿?' } },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Error de validación.');
  });

  it('admin con grafo válido → 201', async () => {
    const res = await post(makeToken(tenantId.toString(), 'admin'), flowValido());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nombre: 'Flujo de prueba', version: 1, estado: 'borrador', activo: false });
  });
});

describe('GET /api/flows/:id', () => {
  it('sin sesión → 401', async () => {
    const res = await request(app).get(`/api/flows/${new Types.ObjectId().toString()}`);
    expect(res.status).toBe(401);
  });

  it('id con formato inválido → 400', async () => {
    const res = await request(app)
      .get('/api/flows/no-es-un-objectid')
      .set('Cookie', `token=${makeToken(new Types.ObjectId().toString(), 'admin')}`);
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/flows/:id — activación exclusiva', () => {
  let tenantId: Types.ObjectId;
  let token: string;

  beforeEach(async () => {
    await Flow.deleteMany({});
    await Flow.syncIndexes();
    tenantId = new Types.ObjectId();
    token = makeToken(tenantId.toString(), 'admin');
  });

  it('activar un flujo con `activo: true` desactiva el flujo activo anterior del tenant', async () => {
    const primero = await post(token, flowValido({ nombre: 'Primero' })).expect(201);
    await put(token, primero.body.id, flowValido({ nombre: 'Primero', activo: true })).expect(200);

    const segundo = await post(token, flowValido({ nombre: 'Segundo' })).expect(201);
    const activado = await put(token, segundo.body.id, flowValido({ nombre: 'Segundo', activo: true }));

    expect(activado.status).toBe(200);
    expect(activado.body.activo).toBe(true);

    const primeroActualizado = await Flow.findById(primero.body.id).lean();
    expect(primeroActualizado?.activo).toBe(false);
  });

  it('un flujo de otro tenant → 404, nunca 403, y sigue intacto', async () => {
    const tenantA = new Types.ObjectId();
    const tokenA = makeToken(tenantA.toString(), 'admin');
    const creado = await post(tokenA, flowValido()).expect(201);

    const res = await put(token, creado.body.id, flowValido({ nombre: 'Secuestrado' }));
    expect(res.status).toBe(404);

    const intacto = await Flow.findById(creado.body.id).lean();
    expect(intacto?.nombre).toBe('Flujo de prueba');
  });
});

describe('GET/PUT /api/flows/reminder — HU-FLOW-02 (rutas literales antes de /:id)', () => {
  let tenantId: Types.ObjectId;
  let token: string;

  beforeEach(async () => {
    await Tenant.deleteMany({});
    tenantId = (
      await Tenant.create({
        nombre: 'Empresa reminder',
        slug: `empresa-reminder-${Math.random().toString(36).slice(2)}`,
        contacto: { email: 'r@t.com', telefono: '3000000000' },
        estado: 'activo',
      })
    )._id as Types.ObjectId;
    token = makeToken(tenantId.toString(), 'admin');
  });

  it('sin sesión → 401', async () => {
    const res = await request(app).get('/api/flows/reminder');
    expect(res.status).toBe(401);
  });

  it('rol superadmin (no admin) → 403', async () => {
    const res = await request(app)
      .get('/api/flows/reminder')
      .set('Cookie', `token=${makeToken(tenantId.toString(), 'superadmin')}`);
    expect(res.status).toBe(403);
  });

  it('GET antes de configurar nada → 200 con los defaults (desactivado)', async () => {
    const res = await request(app).get('/api/flows/reminder').set('Cookie', `token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activo: false, antelacionMinutos: 120, texto: '', templateId: null });
  });

  it('PUT con activo:true y sin texto → 422 (regla de coherencia)', async () => {
    const res = await request(app)
      .put('/api/flows/reminder')
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ activo: true, antelacionMinutos: 120, texto: '' });
    expect(res.status).toBe(422);
  });

  it('PUT válido → 200, y el GET posterior refleja el cambio', async () => {
    const put = await request(app)
      .put('/api/flows/reminder')
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ activo: true, antelacionMinutos: 60, texto: '¡Hola! ¿Sigues por ahí?' });

    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ activo: true, antelacionMinutos: 60, texto: '¡Hola! ¿Sigues por ahí?' });

    const get = await request(app).get('/api/flows/reminder').set('Cookie', `token=${token}`);
    expect(get.body).toMatchObject({ activo: true, antelacionMinutos: 60 });
  });

  it('aislamiento: el admin de B ve y escribe SU PROPIA configuración, nunca la de A', async () => {
    const tenantB = (
      await Tenant.create({
        nombre: 'Empresa B reminder',
        slug: `empresa-b-reminder-${Math.random().toString(36).slice(2)}`,
        contacto: { email: 'b@t.com', telefono: '3000000000' },
        estado: 'activo',
      })
    )._id as Types.ObjectId;
    const tokenB = makeToken(tenantB.toString(), 'admin');

    await request(app)
      .put('/api/flows/reminder')
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ activo: true, antelacionMinutos: 90, texto: 'Recordatorio de A' });

    const getB = await request(app).get('/api/flows/reminder').set('Cookie', `token=${tokenB}`);
    expect(getB.body).toMatchObject({ activo: false, antelacionMinutos: 120, texto: '' });

    const tenantADoc = await Tenant.findById(tenantId).lean();
    expect(tenantADoc?.recordatorio?.texto).toBe('Recordatorio de A');
  });
});
