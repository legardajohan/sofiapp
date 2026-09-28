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

vi.mock('../../integrations/meta/meta-onboarding.client.js', () => ({
  PIN_REQUIRED_REASON: 'pin_required',
  metaOnboardingClient: {
    exchangeCode: vi.fn().mockResolvedValue('token-de-negocio'),
    subscribeApp: vi.fn().mockResolvedValue(undefined),
    registerPhone: vi.fn().mockResolvedValue(undefined),
    getPhoneInfo: vi.fn().mockResolvedValue({ displayPhoneNumber: '+57 300', verifiedName: 'Acme' }),
  },
}));

vi.mock('../../integrations/meta/meta-phone-number.client.js', () => ({
  metaPhoneNumberClient: { getHealth: vi.fn().mockResolvedValue(null) },
}));

import app from '../../app.js';
import { MetaIntegration } from './channel.model.js';

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

describe('HT-WA-03 — contrato HTTP de /api/channels/whatsapp', () => {
  const tenantId = new Types.ObjectId().toString();
  const body = { code: 'code-1', wabaId: 'waba-1', phoneNumberId: 'phone-1' };

  beforeEach(async () => {
    await MetaIntegration.deleteMany({});
  });

  it('POST /embedded-signup → 200 con el canal activo y sin secretos', async () => {
    const res = await auth(request(app).post('/api/channels/whatsapp/embedded-signup'), tenantId).send(
      body,
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activo: true, displayPhoneNumber: '+57 300' });
    expect(res.body).not.toHaveProperty('accessTokenEnc');
    expect(res.body).not.toHaveProperty('pinEnc');
  });

  it('POST /embedded-signup con un accessToken colado → 400 (strict)', async () => {
    const res = await auth(request(app).post('/api/channels/whatsapp/embedded-signup'), tenantId).send(
      { ...body, accessToken: 'x' },
    );
    expect(res.status).toBe(400);
  });

  it('POST /embedded-signup sin code → 400', async () => {
    const res = await auth(request(app).post('/api/channels/whatsapp/embedded-signup'), tenantId).send(
      { wabaId: 'w', phoneNumberId: 'p' },
    );
    expect(res.status).toBe(400);
  });

  it('POST /activate con un PIN de 5 dígitos → 400', async () => {
    const res = await auth(request(app).post('/api/channels/whatsapp/activate'), tenantId).send({
      pin: '12345',
    });
    expect(res.status).toBe(400);
  });

  it('POST /activate sin canal configurado → 404', async () => {
    const res = await auth(request(app).post('/api/channels/whatsapp/activate'), tenantId).send({});
    expect(res.status).toBe(404);
  });

  it('un rol que no es admin → 403', async () => {
    const res = await auth(
      request(app).post('/api/channels/whatsapp/embedded-signup'),
      tenantId,
      'asesor',
    ).send(body);
    expect(res.status).toBe(403);
  });
});
