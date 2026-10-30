/**
 * HU-IA-08, criterio 13: cadena de middlewares y contrato HTTP de `/api/sandbox/*`.
 */
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));
const { responderMock } = vi.hoisted(() => ({ responderMock: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../workers/inbound-message.processor.js', () => ({ responderAutomaticamente: responderMock }));
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn().mockResolvedValue(undefined),
  subscribeRealtime: vi.fn(),
}));

import app from '../../app.js';
import { Cliente } from '../cliente/cliente.model.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';

function token(sub: string, tenantId: string, rol = 'admin'): string {
  return jwt.sign({ sub, tenantId, email: 'u@e.com', nombre: 'U', rol, activo: true }, SECRET, {
    expiresIn: '1h',
  });
}

function llamar(
  metodo: 'get' | 'post' | 'put',
  ruta: string,
  tk: string | null,
  body?: Record<string, unknown>,
): request.Test {
  const cookies = tk ? [`token=${tk}`, `csrfToken=${CSRF}`] : [`csrfToken=${CSRF}`];
  const req = request(app)[metodo](ruta).set('Cookie', cookies).set('X-CSRF-Token', CSRF);
  return body ? req.send(body) : req;
}

describe('/api/sandbox — cadena de middlewares y contrato', () => {
  const tenantId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  it('sin sesión → 401 en todas las rutas', async () => {
    expect((await llamar('get', '/api/sandbox/session', null)).status).toBe(401);
    expect((await llamar('post', '/api/sandbox/messages', null, { texto: 'hola' })).status).toBe(401);
    expect((await llamar('put', '/api/sandbox/session', null, { flowId: null })).status).toBe(401);
    expect((await llamar('post', '/api/sandbox/session/reset', null)).status).toBe(401);
    expect((await llamar('post', '/api/sandbox/session/advance-wait', null)).status).toBe(401);
  });

  it('un rol que no es admin → 403', async () => {
    const tk = token(userId, tenantId, 'superadmin');
    expect((await llamar('get', '/api/sandbox/session', tk)).status).toBe(403);
    expect((await llamar('post', '/api/sandbox/messages', tk, { texto: 'hola' })).status).toBe(403);
  });

  it('GET /session como admin → 200 y crea la sesión del token (tenant y usuario del JWT)', async () => {
    const res = await llamar('get', '/api/sandbox/session', token(userId, tenantId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ iaHabilitada: true, flujo: null, mensajes: [] });

    const cliente = await Cliente.findById(res.body.clienteId).lean();
    expect(String(cliente?.tenantId)).toBe(tenantId);
    expect(String(cliente?.pruebaOwnerId)).toBe(userId);
  });

  it('POST /messages → 202 con el mensaje guardado, sin esperar la respuesta automática', async () => {
    const res = await llamar('post', '/api/sandbox/messages', token(userId, tenantId), { texto: '  hola  ' });
    expect(res.status).toBe(202);
    expect(res.body.message.texto).toBe('hola');
    expect(res.body.message.sender).toBe('user');
  });

  it('POST /messages valida el borde: vacío, demasiado largo y campos de más → 400', async () => {
    const tk = token(userId, tenantId);
    expect((await llamar('post', '/api/sandbox/messages', tk, { texto: '   ' })).status).toBe(400);
    expect((await llamar('post', '/api/sandbox/messages', tk, { texto: 'x'.repeat(4097) })).status).toBe(400);
    // Ningún endpoint acepta un `clienteId` ni un `tenantId` del body: el schema es estricto.
    const conClienteId = await llamar('post', '/api/sandbox/messages', tk, {
      texto: 'hola',
      clienteId: new Types.ObjectId().toString(),
    });
    expect(conClienteId.status).toBe(400);
    const conTenant = await llamar('post', '/api/sandbox/messages', tk, {
      texto: 'hola',
      tenantId: new Types.ObjectId().toString(),
    });
    expect(conTenant.status).toBe(400);
  });

  it('PUT /session: id inválido → 400; flujo inexistente → 404; null → 200', async () => {
    const tk = token(userId, tenantId);
    expect((await llamar('put', '/api/sandbox/session', tk, { flowId: 'no-es-un-id' })).status).toBe(400);
    expect(
      (await llamar('put', '/api/sandbox/session', tk, { flowId: new Types.ObjectId().toString() })).status,
    ).toBe(404);
    expect((await llamar('put', '/api/sandbox/session', tk, { flowId: null })).status).toBe(200);
  });

  it('POST /session/advance-wait sin espera pendiente → 409', async () => {
    const tk = token(userId, tenantId);
    await llamar('get', '/api/sandbox/session', tk);
    expect((await llamar('post', '/api/sandbox/session/advance-wait', tk)).status).toBe(409);
  });

  it('POST /session/reset → 200 con una sesión nueva y vacía', async () => {
    const tk = token(userId, tenantId);
    const antes = await llamar('get', '/api/sandbox/session', tk);
    await llamar('post', '/api/sandbox/messages', tk, { texto: 'hola' });

    const res = await llamar('post', '/api/sandbox/session/reset', tk);
    expect(res.status).toBe(200);
    expect(res.body.clienteId).not.toBe(antes.body.clienteId);
    expect(res.body.mensajes).toEqual([]);
  });

  it('dos tenants con el mismo userId no comparten sesión', async () => {
    const otroTenant = new Types.ObjectId().toString();
    const a = await llamar('get', '/api/sandbox/session', token(userId, tenantId));
    const b = await llamar('get', '/api/sandbox/session', token(userId, otroTenant));
    expect(a.body.clienteId).not.toBe(b.body.clienteId);
  });
});
