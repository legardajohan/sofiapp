import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Types } from 'mongoose';

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

vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

import app from '../../app.js';
import { crearContacto, crearTenant, crearUsuario } from '../pendiente/pendiente.fixtures.js';
import { crearRecordatorio, HACE_UNA_HORA } from './organizador.fixtures.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';

function token(tenantId: Types.ObjectId, sub: string, subrol?: string): string {
  return jwt.sign(
    { sub, tenantId: String(tenantId), email: 'u@e.com', nombre: 'U', rol: 'admin', activo: true, subrol },
    SECRET,
    { expiresIn: '1h' },
  );
}

function get(t: string, url: string): request.Test {
  return request(app).get(url).set('Cookie', [`token=${t}`]);
}

function conCsrf(req: request.Test, t: string): request.Test {
  return req.set('Cookie', [`token=${t}`, `csrfToken=${CSRF}`]).set('X-CSRF-Token', CSRF);
}

describe('HU-PDF-02 — rutas del Organizador', () => {
  let tenant: Types.ObjectId;
  let ana: string;
  let nota: string;
  let version: string;

  beforeEach(async () => {
    tenant = await crearTenant('Academia');
    ana = await crearUsuario(tenant, 'Ana');
    const contacto = await crearContacto(tenant, { nombre: 'Luis' });
    const at = HACE_UNA_HORA();
    version = at.toISOString();
    nota = await crearRecordatorio(tenant, contacto, ana, 'Llamar', { recordatorioAt: at });
  });

  it('un subrol sin acceso a notas recibe 403 en todo el Organizador', async () => {
    const t = token(tenant, ana, 'coordinator');
    for (const url of [
      '/api/organizador/preferencias',
      '/api/organizador/pendientes',
      '/api/organizador/conteos',
      '/api/organizador/activos',
      '/api/organizador/historial',
      `/api/organizador/pendientes/${nota}/historial`,
      '/api/organizador/motivos-cierre',
    ]) {
      expect((await get(t, url)).status, url).toBe(403);
    }
    const cerrar = await conCsrf(request(app).post(`/api/organizador/pendientes/${nota}/cerrar`), t)
      .send({ motivoKeys: ['venta'], version });
    expect(cerrar.status).toBe(403);
    const pref = await conCsrf(request(app).put('/api/organizador/preferencias'), t).send({
      activo: false,
    });
    expect(pref.status).toBe(403);
  });

  it('preferencia: PUT y GET', async () => {
    const t = token(tenant, ana);
    const put = await conCsrf(request(app).put('/api/organizador/preferencias'), t).send({
      activo: false,
    });
    expect(put.status).toBe(200);
    expect((await get(t, '/api/organizador/preferencias')).body).toEqual({ activo: false });
  });

  it('activos devuelve el vencido del usuario', async () => {
    const res = await get(token(tenant, ana), '/api/organizador/activos');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe(nota);
  });

  it('CA-05 — cerrar sin motivo → 400; con «otros» sin texto → 400; con motivo → 200; repetir → 409', async () => {
    const t = token(tenant, ana);
    const url = `/api/organizador/pendientes/${nota}/cerrar`;
    expect((await conCsrf(request(app).post(url), t).send({ version })).status).toBe(400);
    expect(
      (await conCsrf(request(app).post(url), t).send({ otro: { texto: ' ' }, version })).status,
    ).toBe(400);
    const ok = await conCsrf(request(app).post(url), t).send({
      otro: { texto: 'Se resolvió por teléfono' },
      version,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.estado).toBe('cerrado');
    expect(
      (await conCsrf(request(app).post(url), t).send({ motivoKeys: ['venta'], version })).status,
    ).toBe(409);
  });

  it('CA-08 — posponer exige motivo, fecha y hora válidas', async () => {
    const t = token(tenant, ana);
    const url = `/api/organizador/pendientes/${nota}/posponer`;
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const base = { motivo: 'No contestó', nuevoDia: manana, nuevaHora: '10:00', version };
    expect((await conCsrf(request(app).post(url), t).send({ ...base, motivo: '' })).status).toBe(400);
    expect(
      (await conCsrf(request(app).post(url), t).send({ ...base, nuevaHora: undefined })).status,
    ).toBe(400);
    expect(
      (await conCsrf(request(app).post(url), t).send({ ...base, nuevoDia: '2020-01-01' })).status,
    ).toBe(400);
    const ok = await conCsrf(request(app).post(url), t).send(base);
    expect(ok.status).toBe(200);
    expect(ok.body.estado).toBe('pospuesto');
  });

  it('motivos: crear (201) y duplicado (409)', async () => {
    const t = token(tenant, ana);
    const url = '/api/organizador/motivos-cierre';
    expect((await conCsrf(request(app).post(url), t).send({ nombre: 'Agendó visita' })).status).toBe(
      201,
    );
    expect((await conCsrf(request(app).post(url), t).send({ nombre: 'agendó visita' })).status).toBe(
      409,
    );
    const lista = await get(t, url);
    expect(lista.body.predefinidos).toHaveLength(9);
    expect(lista.body.personalizados).toHaveLength(1);
  });
});
