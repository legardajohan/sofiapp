import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

// Mock de las colas: evita conectar a Redis al importar `app`.
vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  CAMPAIGN_QUEUE_NAME: 'campaign-broadcast',
  CAMPAIGN_BATCH_JOB: 'batch',
  CAMPAIGN_START_JOB: 'start-scheduled',
  CAMPAIGN_SWEEP_SCHEDULER_ID: 'campaign-sweep',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
  campaignQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../integrations/meta/meta-phone-number.client.js', () => ({
  metaPhoneNumberClient: {
    getHealth: vi.fn().mockResolvedValue({
      messagingTier: 'TIER_1K',
      qualityRating: 'GREEN',
      healthStatus: 'AVAILABLE',
    }),
  },
}));

import app from '../../app.js';
import { createScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Campaign } from './campaign.model.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';

function token(tenantId: string | null, rol: string): string {
  return jwt.sign(
    { sub: '507f1f77bcf86cd799439012', tenantId, email: 'u@e.com', nombre: 'U', rol, activo: true },
    SECRET,
    { expiresIn: '1h' },
  );
}

/** Cookies + header que exige el pipeline: JWT en cookie httpOnly y CSRF double-submit. */
function auth(req: request.Test, tenantId: string, rol = 'admin'): request.Test {
  return req
    .set('Cookie', [`token=${token(tenantId, rol)}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF);
}

describe('HU-MARK-01 — contrato HTTP de /api/campaigns', () => {
  const tenantId = new Types.ObjectId();

  beforeEach(async () => {
    await Promise.all([Campaign.deleteMany({}), Cliente.deleteMany({}), MetaIntegration.deleteMany({})]);

    await createScoped(MetaIntegration, tenantId, {
      canal: 'whatsapp',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessTokenEnc: encrypt('token'),
      activo: true,
    });
    await createScoped(Cliente, tenantId, {
      metaUserId: 'meta-1',
      telefono: '573001110001',
      nombre: 'Ana',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      rolContacto: 'estudiante',
      marketingOptOut: false,
    });
  });

  it('sin sesión → 401', async () => {
    const res = await request(app).get('/api/campaigns');
    expect(res.status).toBe(401);
  });

  it('con rol distinto de admin → 403', async () => {
    const res = await request(app)
      .get('/api/campaigns')
      .set('Cookie', `token=${token(new Types.ObjectId().toString(), 'superadmin')}`);
    expect(res.status).toBe(403);
  });

  it('sin X-CSRF-Token una mutación se corta antes de autenticar → 403', async () => {
    const res = await request(app).post('/api/campaigns').send({});
    expect(res.status).toBe(403);
  });

  it('admin → 200 y el listado llega paginado como manda el contrato', async () => {
    const res = await auth(request(app).get('/api/campaigns'), tenantId.toString());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 0 });
    expect(res.body.data).toEqual([]);
  });

  it('`/segmento/preview` se resuelve como ruta literal, no como un `:id`', async () => {
    const res = await auth(
      request(app).post('/api/campaigns/segmento/preview'),
      tenantId.toString(),
    ).send({ filtros: { rolContacto: ['estudiante'] } });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.presupuesto).toMatchObject({ tier: 'TIER_1K', calidad: 'GREEN' });
  });

  it('un cuerpo con `lanzar` y `programadaPara` a la vez → 400 con el detalle de Zod', async () => {
    const res = await auth(request(app).post('/api/campaigns'), tenantId.toString()).send({
      nombre: 'Promo',
      filtros: {},
      templateId: new Types.ObjectId().toString(),
      parametros: [],
      lanzar: true,
      programadaPara: new Date(Date.now() + 3_600_000).toISOString(),
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Error de validación.');
  });

  it('una clave de más en el cuerpo → 400 (schema `.strict()`)', async () => {
    const res = await auth(request(app).post('/api/campaigns'), tenantId.toString()).send({
      nombre: 'Promo',
      filtros: {},
      templateId: new Types.ObjectId().toString(),
      parametros: [],
      estado: 'completada',
    });

    expect(res.status).toBe(400);
  });

  it('una campaña de otro tenant → 404, nunca 403', async () => {
    const ajena = await createScoped(Campaign, new Types.ObjectId(), {
      nombre: 'Ajena',
      filtros: {},
      templateId: new Types.ObjectId(),
      parametros: [],
      creadaPor: new Types.ObjectId(),
    });

    const res = await auth(
      request(app).get(`/api/campaigns/${ajena._id.toString()}`),
      tenantId.toString(),
    );

    expect(res.status).toBe(404);
  });
});
