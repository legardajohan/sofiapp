/**
 * HU-MARK-04 — contrato HTTP de las métricas (criterios 4 y 5): cadena de middlewares, Zod del
 * rango y que `/metrics` se resuelva como ruta literal y no como un `:id`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  CAMPAIGN_QUEUE_NAME: 'campaign-broadcast',
  CAMPAIGN_BATCH_JOB: 'batch',
  CAMPAIGN_START_JOB: 'start-scheduled',
  CAMPAIGN_SCHEDULED_START_JOB: 'start-exact',
  CAMPAIGN_SWEEP_SCHEDULER_ID: 'campaign-sweep',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
  campaignQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import app from '../../app.js';
import { createScoped } from '../../repositories/base.repository.js';
import { Campaign } from './campaign.model.js';
import { CampaignRecipient } from './campaign-recipient.model.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';

function token(tenantId: string | null, rol: string): string {
  return jwt.sign(
    { sub: '507f1f77bcf86cd799439012', tenantId, email: 'u@e.com', nombre: 'U', rol, activo: true },
    SECRET,
    { expiresIn: '1h' },
  );
}

function auth(req: request.Test, tenantId: string, rol = 'admin'): request.Test {
  return req
    .set('Cookie', [`token=${token(tenantId, rol)}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF);
}

describe('HU-MARK-04 — contrato HTTP de /api/campaigns/.../metrics', () => {
  const tenantId = new Types.ObjectId();
  let campaignId: string;

  beforeEach(async () => {
    await Promise.all([Campaign.deleteMany({}), CampaignRecipient.deleteMany({})]);
    const campana = await createScoped(Campaign, tenantId, {
      nombre: 'Promo',
      templateId: new Types.ObjectId(),
      parametros: [],
      estado: 'completada',
      creadaPor: new Types.ObjectId(),
      iniciadaAt: new Date(),
    });
    campaignId = String(campana._id);
    await createScoped(CampaignRecipient, tenantId, {
      campaignId: campana._id,
      clienteId: new Types.ObjectId(),
      telefono: '573001110001',
      estado: 'entregado',
      enviadoAt: new Date(),
      leidoAt: new Date(),
    });
  });

  it('GET /:id/metrics sin sesión → 401', async () => {
    const res = await request(app).get(`/api/campaigns/${campaignId}/metrics`);
    expect(res.status).toBe(401);
  });

  it('GET /:id/metrics con rol distinto de admin → 403', async () => {
    const res = await request(app)
      .get(`/api/campaigns/${campaignId}/metrics`)
      .set('Cookie', `token=${token(new Types.ObjectId().toString(), 'superadmin')}`);
    expect(res.status).toBe(403);
  });

  it('GET /:id/metrics → 200 con la forma del contrato', async () => {
    const res = await auth(request(app).get(`/api/campaigns/${campaignId}/metrics`), tenantId.toString());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      campaignId,
      destinatarios: 1,
      enviados: 1,
      entregados: 1,
      leidos: 1,
      respondidos: 0,
      convertidos: 0,
      fallidos: 0,
      tasas: { entrega: 1, apertura: 1, respuesta: 0, conversion: 0 },
      ventanas: { respuestaHoras: 72, conversionDias: 14 },
    });
    expect(typeof res.body.calculadoAt).toBe('string');
  });

  it('GET /:id/metrics de un id inexistente → 404; id mal formado → 400', async () => {
    const inexistente = await auth(
      request(app).get(`/api/campaigns/${new Types.ObjectId().toString()}/metrics`),
      tenantId.toString(),
    );
    expect(inexistente.status).toBe(404);

    const malo = await auth(request(app).get('/api/campaigns/no-es-un-id/metrics'), tenantId.toString());
    expect(malo.status).toBe(400);
  });

  it('GET /metrics se resuelve como ruta literal y agrega el período', async () => {
    const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const res = await auth(
      request(app).get('/api/campaigns/metrics').query({ desde }),
      tenantId.toString(),
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalCampanas: 1, enviados: 1, leidos: 1 });
    expect(res.body.campanas).toHaveLength(1);
  });

  it('`zona` inválida → 400; válida → la serie llega en el cuerpo', async () => {
    const mala = await auth(
      request(app).get(`/api/campaigns/${campaignId}/metrics`).query({ zona: 'Marte/Olympus' }),
      tenantId.toString(),
    );
    expect(mala.status).toBe(400);

    const buena = await auth(
      request(app).get(`/api/campaigns/${campaignId}/metrics`).query({ zona: 'America/Bogota' }),
      tenantId.toString(),
    );
    expect(buena.status).toBe(200);
    expect(Array.isArray(buena.body.serie)).toBe(true);
    expect(buena.body.serie.length).toBeGreaterThan(0);
  });

  it('GET /metrics con rango invertido o mayor de 366 días → 400', async () => {
    const invertido = await auth(
      request(app)
        .get('/api/campaigns/metrics')
        .query({ desde: '2026-10-01T00:00:00Z', hasta: '2026-09-01T00:00:00Z' }),
      tenantId.toString(),
    );
    expect(invertido.status).toBe(400);

    const largo = await auth(
      request(app)
        .get('/api/campaigns/metrics')
        .query({ desde: '2024-01-01T00:00:00Z', hasta: '2026-01-01T00:00:00Z' }),
      tenantId.toString(),
    );
    expect(largo.status).toBe(400);
  });
});
