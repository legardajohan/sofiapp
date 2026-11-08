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

  it('un nodo suelto se GUARDA con una advertencia y el flujo no queda activo (HU-FLOW-05)', async () => {
    const res = await post(
      makeToken(tenantId.toString(), 'admin'),
      flowValido({
        nodos: [
          { id: 'n1', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: 'Hola' } },
          { id: 'huerfano', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: '¿?' } },
        ],
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.activo).toBe(false);
    expect(res.body.advertencias).toEqual([expect.objectContaining({ nodoId: 'huerfano', codigo: 'NODO_HUERFANO' })]);
  });

  it('un grafo de forma inválida (tipo de dato fuera del enum) → 400 con el detalle de Zod', async () => {
    const res = await post(
      makeToken(tenantId.toString(), 'admin'),
      flowValido({
        nodos: [
          {
            id: 'n1',
            tipo: 'captura',
            posicion,
            config: { tipo: 'captura', campo: 'a', descripcion: 'b', tipoDato: 'otro', pregunta: 'c', reintentos: 1 },
          },
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


describe('Guardar y activar con errores — HU-FLOW-05 (criterios 20-29)', () => {
  let tenantId: Types.ObjectId;
  let token: string;

  const nodoSuelto = { id: 'suelto', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: 'Perdido' } };
  const conSuelto = (overrides: Record<string, unknown> = {}): Record<string, unknown> =>
    flowValido({
      nodos: [{ id: 'n1', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: 'Hola' } }, nodoSuelto],
      ...overrides,
    });
  const iaRecienCreada = {
    id: 'ia1',
    tipo: 'ia',
    posicion,
    config: { tipo: 'ia', objetivo: '', salidas: [], ramaPorDefecto: '', maxTurnos: 3, usarKb: true },
  };

  beforeEach(async () => {
    await Flow.deleteMany({});
    await Flow.syncIndexes();
    tenantId = new Types.ObjectId();
    token = makeToken(tenantId.toString(), 'admin');
  });

  it('un nodo a medias (IA recién creada) se guarda y queda reportado como contenido incompleto', async () => {
    const res = await post(
      token,
      flowValido({
        nodos: [{ id: 'n1', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: 'Hola' } }, iaRecienCreada],
        aristas: [{ id: 'a1', from: 'n1', to: 'ia1' }],
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.advertencias.map((e: { codigo: string }) => e.codigo)).toContain('CONTENIDO_INCOMPLETO');
  });

  it('crear con `activo: true` y errores → 400 FLOW_CON_ERRORES, sin crear nada', async () => {
    const res = await post(token, conSuelto({ activo: true }));
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('FLOW_CON_ERRORES');
    expect(res.body.errores).toEqual([expect.objectContaining({ nodoId: 'suelto' })]);
    expect(await Flow.countDocuments({})).toBe(0);
  });

  it('activar un flujo guardado con errores → 400 y el flujo activo anterior SIGUE activo', async () => {
    const bueno = await post(token, flowValido({ nombre: 'Bueno' })).expect(201);
    await put(token, bueno.body.id, flowValido({ nombre: 'Bueno', activo: true })).expect(200);
    const roto = await post(token, conSuelto({ nombre: 'Roto' })).expect(201);

    const res = await put(token, roto.body.id, conSuelto({ nombre: 'Roto', activo: true }));

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('FLOW_CON_ERRORES');
    expect((await Flow.findById(bueno.body.id).lean())?.activo).toBe(true);
    expect((await Flow.findById(roto.body.id).lean())?.activo).toBe(false);
  });

  it('corregir los errores permite activar', async () => {
    const roto = await post(token, conSuelto()).expect(201);
    const res = await put(
      token,
      roto.body.id,
      conSuelto({ activo: true, aristas: [{ id: 'a1', from: 'n1', to: 'suelto' }] }),
    );
    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(true);
    expect(res.body.advertencias).toEqual([]);
  });

  it('editar un flujo ACTIVO dejándolo con errores sin confirmar → 409 y no se guarda nada', async () => {
    const creado = await post(token, flowValido({ nombre: 'En producción' })).expect(201);
    await put(token, creado.body.id, flowValido({ nombre: 'En producción', activo: true })).expect(200);
    const antes = await Flow.findById(creado.body.id).lean();

    const res = await put(token, creado.body.id, conSuelto({ nombre: 'En producción' }));

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('FLOW_ACTIVO_CON_ERRORES');
    expect(res.body.errores).toHaveLength(1);
    const despues = await Flow.findById(creado.body.id).lean();
    expect(despues?.activo).toBe(true);
    expect(despues?.nodos).toHaveLength(antes?.nodos.length ?? 0);
    expect(despues?.version).toBe(antes?.version);
  });

  it('con `confirmarDesactivar: true` guarda los cambios y deja el flujo INACTIVO', async () => {
    const creado = await post(token, flowValido({ nombre: 'En producción' })).expect(201);
    await put(token, creado.body.id, flowValido({ nombre: 'En producción', activo: true })).expect(200);

    const res = await put(token, creado.body.id, conSuelto({ nombre: 'En producción', confirmarDesactivar: true }));

    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(false);
    expect(res.body.desactivado).toBe(true);
    expect(res.body.advertencias).toHaveLength(1);
    const guardado = await Flow.findById(creado.body.id).lean();
    expect(guardado?.activo).toBe(false);
    expect(guardado?.nodos).toHaveLength(2);
    expect(await Flow.countDocuments({ activo: true })).toBe(0);
  });

  it('un flujo ACTIVO editado sin errores se guarda y sigue activo (sin confirmación)', async () => {
    const creado = await post(token, flowValido()).expect(201);
    await put(token, creado.body.id, flowValido({ activo: true })).expect(200);

    const res = await put(token, creado.body.id, flowValido({ nombre: 'Renombrado' }));

    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(true);
    expect(res.body.desactivado).toBe(false);
  });

  it('un flujo INACTIVO con errores se guarda directo, sin confirmación', async () => {
    const creado = await post(token, flowValido()).expect(201);
    const res = await put(token, creado.body.id, conSuelto());
    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(false);
    expect(res.body.desactivado).toBe(false);
  });

  it('el nombre del nodo se guarda y vuelve en la respuesta', async () => {
    const res = await post(
      token,
      flowValido({
        nodos: [
          { id: 'n1', tipo: 'mensaje', nombre: 'Saludo inicial', posicion, config: { tipo: 'mensaje', texto: 'Hola' } },
        ],
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.nodos[0].nombre).toBe('Saludo inicial');
  });
});
