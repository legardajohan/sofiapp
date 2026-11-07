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
import { Tag } from '../tag/tag.model.js';
import { Tenant } from '../tenant/tenant.model.js';
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

function auth(req: request.Test, tenantId: string, rol = 'admin'): request.Test {
  return req
    .set('Cookie', [`token=${token(tenantId, rol)}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF);
}

describe('HU-MARK-07 — contrato HTTP', () => {
  const tenantId = new Types.ObjectId();
  const t = tenantId.toString();

  beforeEach(async () => {
    await Promise.all([
      Campaign.deleteMany({}),
      Tag.deleteMany({}),
      Tenant.deleteMany({}),
      MetaIntegration.deleteMany({}),
    ]);
    await Tenant.create({
      _id: tenantId,
      nombre: 'Empresa',
      slug: `e-${t}`,
      contacto: { email: 'a@e.com', telefono: '1' },
    });
    await createScoped(MetaIntegration, tenantId, {
      canal: 'whatsapp',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessTokenEnc: encrypt('token'),
      activo: true,
    });
  });

  describe('POST /api/campaigns/audience/preview', () => {
    const body = { audiencia: { tipo: 'mensajes_recientes', rango: '1d' } };

    it('401 sin token', async () => {
      // Con CSRF válido, para que lo que falte sea solo el JWT.
      const res = await request(app)
        .post('/api/campaigns/audience/preview')
        .set('Cookie', [`csrfToken=${CSRF}`])
        .set('X-CSRF-Token', CSRF)
        .send(body);
      expect(res.status).toBe(401);
    });

    it('403 con un rol que no es admin', async () => {
      const res = await auth(request(app).post('/api/campaigns/audience/preview'), t, 'superadmin').send(body);
      expect(res.status).toBe(403);
    });

    it('200 con el rango resuelto y la zona del tenant', async () => {
      const res = await auth(request(app).post('/api/campaigns/audience/preview'), t).send(body);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 0, rango: { zonaHoraria: 'America/Bogota' } });
    });

    it('400 con un rango desconocido o un personalizado sin fechas', async () => {
      const malo = await auth(request(app).post('/api/campaigns/audience/preview'), t).send({
        audiencia: { tipo: 'mensajes_recientes', rango: '30d' },
      });
      expect(malo.status).toBe(400);

      const sinFechas = await auth(request(app).post('/api/campaigns/audience/preview'), t).send({
        audiencia: { tipo: 'mensajes_recientes', rango: 'custom' },
      });
      expect(sinFechas.status).toBe(400);
    });

    it('400 con un rango personalizado invertido', async () => {
      const res = await auth(request(app).post('/api/campaigns/audience/preview'), t).send({
        audiencia: { tipo: 'mensajes_recientes', rango: 'custom', desde: '2026-10-20', hasta: '2026-10-10' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/campaigns/:id/send', () => {
    const id = new Types.ObjectId().toString();

    it('400 si la etiqueta trae tagId Y nombre a la vez', async () => {
      const res = await auth(request(app).post(`/api/campaigns/${id}/send`), t).send({
        etiqueta: { tagId: new Types.ObjectId().toString(), nombre: 'Dos' },
      });
      expect(res.status).toBe(400);
    });

    it('400 con un nombre de etiqueta de más de 60 caracteres', async () => {
      const res = await auth(request(app).post(`/api/campaigns/${id}/send`), t).send({
        etiqueta: { nombre: 'x'.repeat(61) },
      });
      expect(res.status).toBe(400);
    });

    it('404 si la campaña no existe en el tenant', async () => {
      const res = await auth(request(app).post(`/api/campaigns/${id}/send`), t).send({});
      expect(res.status).toBe(404);
    });
  });

  describe('/api/tenants/me/ajustes', () => {
    it('lee y edita la zona horaria; rechaza una zona inválida', async () => {
      const get = await auth(request(app).get('/api/tenants/me/ajustes'), t);
      expect(get.status).toBe(200);
      expect(get.body).toEqual({ zonaHoraria: 'America/Bogota' });

      const mala = await auth(request(app).patch('/api/tenants/me/ajustes'), t).send({ zonaHoraria: 'Marte/X' });
      expect(mala.status).toBe(400);

      const buena = await auth(request(app).patch('/api/tenants/me/ajustes'), t).send({
        zonaHoraria: 'Europe/Madrid',
      });
      expect(buena.status).toBe(200);
      expect(buena.body).toEqual({ zonaHoraria: 'Europe/Madrid' });
    });

    it('403 para un rol que no es admin', async () => {
      const res = await auth(request(app).get('/api/tenants/me/ajustes'), t, 'superadmin');
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/tags — tope de 60', () => {
    it('acepta 60 caracteres y rechaza 61', async () => {
      const ok = await auth(request(app).post('/api/tags'), t).send({ nombre: 'a'.repeat(60), color: '#112233' });
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ origen: 'manual', campaignId: null });

      const largo = await auth(request(app).post('/api/tags'), t).send({ nombre: 'b'.repeat(61), color: '#112233' });
      expect(largo.status).toBe(400);
    });
  });
});
