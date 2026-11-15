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
import { seedEstados } from '../../seed/seed-estados.js';
import { crearContacto, crearNota, crearTenant, crearUsuario } from './pendiente.fixtures.js';

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

const PDF_OK = '/api/pendientes/pdf?desde=2026-10-01&hasta=2026-10-31&tz=America/Bogota';

describe('HU-PDF-01 — rutas de pendientes y de edición de notas', () => {
  let tenant: Types.ObjectId;
  let actor: string;
  let contacto: string;
  let nota: string;

  beforeEach(async () => {
    tenant = await crearTenant('Academia Alfa');
    await seedEstados(tenant);
    actor = await crearUsuario(tenant, 'Diego');
    contacto = await crearContacto(tenant, { nombre: 'Luis' });
    nota = await crearNota(tenant, contacto, actor, 'Llamar', {
      createdAt: new Date('2026-10-10T15:00:00Z'),
    });
  });

  describe('CA10 — permisos (RN8)', () => {
    it('coordinador y asesor también entran: los tres roles ven datos sensibles (AUTH-05)', async () => {
      for (const subrol of ['coordinator', 'secretary']) {
        const t = token(tenant, actor, subrol);
        expect((await get(t, '/api/pendientes')).status).toBe(200);
        const patch = conCsrf(
          request(app).patch(`/api/clientes/${contacto}/notas/${nota}`),
          t,
        ).send({ pendiente: false });
        expect((await patch).status).not.toBe(403);
      }
    });

    it('un admin sin subrol o con subrol autorizado entra', async () => {
      expect((await get(token(tenant, actor), '/api/pendientes')).status).toBe(200);
      expect((await get(token(tenant, actor, 'manager'), '/api/pendientes')).status).toBe(200);
    });
  });

  describe('GET /api/pendientes', () => {
    it('devuelve la página con la forma pactada', async () => {
      const res = await get(token(tenant, actor), '/api/pendientes?limit=10');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page: 1, limit: 10, total: 1 });
      expect(res.body.data[0]).toMatchObject({
        id: nota,
        clienteId: contacto,
        descripcion: 'Llamar',
        lead: { nombre: 'Luis', etapa: null },
      });
    });

    it('rechaza un limit por encima del máximo', async () => {
      expect((await get(token(tenant, actor), '/api/pendientes?limit=500')).status).toBe(400);
    });
  });

  describe('GET /api/pendientes/pdf', () => {
    it('CA4: responde el PDF como adjunto con el nombre pactado', async () => {
      const res = await get(token(tenant, actor), PDF_OK).buffer(true).parse((r, cb) => {
        const trozos: Buffer[] = [];
        r.on('data', (c: Buffer) => trozos.push(c));
        r.on('end', () => cb(null, Buffer.concat(trozos)));
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="Pendientes_2026-10-01_a_2026-10-31.pdf"',
      );
      expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it('CA5: rango vacío → 404 JSON con el mensaje de la historia', async () => {
      const res = await get(
        token(tenant, actor),
        '/api/pendientes/pdf?desde=2026-01-01&hasta=2026-01-31&tz=America/Bogota',
      );
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'No hay pendientes en el rango seleccionado.' });
    });

    it.each([
      ['fecha final anterior a la inicial', 'desde=2026-10-31&hasta=2026-10-01'],
      ['falta la fecha final', 'desde=2026-10-01'],
      ['falta la fecha inicial', 'hasta=2026-10-01'],
      ['fecha inexistente', 'desde=2026-02-30&hasta=2026-03-01'],
      ['zona horaria inválida', 'desde=2026-10-01&hasta=2026-10-02&tz=Marte/Olympus'],
      ['rango de más de 366 días', 'desde=2025-01-01&hasta=2026-10-01'],
    ])('CA6: %s → 400', async (_caso, qs) => {
      expect((await get(token(tenant, actor), `/api/pendientes/pdf?${qs}`)).status).toBe(400);
    });
  });

  describe('PATCH / DELETE /api/clientes/:clienteId/notas/:notaId', () => {
    it('CA8: PATCH con body vacío → 400', async () => {
      const res = await conCsrf(
        request(app).patch(`/api/clientes/${contacto}/notas/${nota}`),
        token(tenant, actor),
      ).send({});
      expect(res.status).toBe(400);
    });

    it('CA8: PATCH quita el pendiente y DELETE responde 204', async () => {
      const t = token(tenant, actor);
      const patch = await conCsrf(
        request(app).patch(`/api/clientes/${contacto}/notas/${nota}`),
        t,
      ).send({ pendiente: false });
      expect(patch.status).toBe(200);
      expect(patch.body).toMatchObject({ id: nota, pendiente: false, texto: 'Llamar' });
      expect((await get(t, '/api/pendientes')).body.total).toBe(0);

      const del = await conCsrf(request(app).delete(`/api/clientes/${contacto}/notas/${nota}`), t);
      expect(del.status).toBe(204);
    });

    it('POST acepta `pendiente` y lo devuelve', async () => {
      const res = await conCsrf(
        request(app).post(`/api/clientes/${contacto}/notas`),
        token(tenant, actor),
      ).send({ texto: 'Nueva', pendiente: true });
      expect(res.status).toBe(201);
      expect(res.body.pendiente).toBe(true);
    });
  });

  describe('HU-PDF-01 A1 — programar, cerrar, historial y reabrir', () => {
    it('CA13: POST guarda día y hora; programar sin pendiente → 400; hora inválida → 400', async () => {
      const t = token(tenant, actor);
      const url = `/api/clientes/${contacto}/notas`;
      const ok = await conCsrf(request(app).post(url), t).send({
        texto: 'Programada',
        pendiente: true,
        programadoDia: '2026-12-01',
        programadoHora: '08:15',
      });
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ programadoDia: '2026-12-01', programadoHora: '08:15' });

      const sinPendiente = await conCsrf(request(app).post(url), t).send({
        texto: 'x',
        programadoDia: '2026-12-01',
      });
      expect(sinPendiente.status).toBe(400);

      const horaMala = await conCsrf(request(app).post(url), t).send({
        texto: 'x',
        pendiente: true,
        programadoHora: '25:00',
      });
      expect(horaMala.status).toBe(400);
    });

    it('CA16/CA17: cerrar → historial → reabrir, con 409 al repetir', async () => {
      const t = token(tenant, actor);
      const cerrar = await conCsrf(request(app).post(`/api/pendientes/${nota}/cerrar`), t);
      expect(cerrar.status).toBe(200);
      expect(cerrar.body).toMatchObject({ id: nota, estado: 'cerrado', cerradoPor: { id: actor } });

      expect((await get(t, '/api/pendientes')).body.total).toBe(0);
      const historial = await get(t, '/api/pendientes?estado=cerrado');
      expect(historial.body.data.map((p: { id: string }) => p.id)).toEqual([nota]);

      expect((await conCsrf(request(app).post(`/api/pendientes/${nota}/cerrar`), t)).status).toBe(409);

      const reabrir = await conCsrf(request(app).post(`/api/pendientes/${nota}/reabrir`), t);
      expect(reabrir.status).toBe(200);
      expect(reabrir.body.estado).toBe('abierto');
      expect((await conCsrf(request(app).post(`/api/pendientes/${nota}/reabrir`), t)).status).toBe(409);
    });

    it('estado inválido → 400; id inválido → 400; el asesor también puede cerrar (AUTH-05)', async () => {
      const t = token(tenant, actor);
      expect((await get(t, '/api/pendientes?estado=todos')).status).toBe(400);
      expect((await conCsrf(request(app).post('/api/pendientes/no-es-id/cerrar'), t)).status).toBe(400);
      const asesor = token(tenant, actor, 'secretary');
      expect(
        (await conCsrf(request(app).post(`/api/pendientes/${nota}/cerrar`), asesor)).status,
      ).not.toBe(403);
    });
  });
});
