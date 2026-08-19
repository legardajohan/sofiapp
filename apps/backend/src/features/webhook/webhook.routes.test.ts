import { createHmac } from 'crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';

// Mock de las colas BullMQ: evita conexión a Redis al importar `app`.
vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  inboundQueue: { add: vi.fn().mockResolvedValue(undefined) },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import app from '../../app.js';
import { inboundQueue } from '../../config/queues.js';
import { createScoped } from '../../repositories/base.repository.js';
import { MetaIntegration } from '../channel/channel.model.js';

const APP_SECRET = 'test-app-secret-12345678901234';
const VERIFY_TOKEN = 'test-verify-token';
const PHONE_NUMBER_ID = '1234567890';
const TENANT_ID = new Types.ObjectId();

function sign(raw: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`;
}

function buildPayload(): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '573000000000', phone_number_id: PHONE_NUMBER_ID },
              contacts: [{ profile: { name: 'Cliente Prueba' }, wa_id: '573001112233' }],
              messages: [
                { from: '573001112233', id: 'wamid.TEST123', timestamp: '1700000000', type: 'text', text: { body: 'Hola' } },
              ],
            },
          },
        ],
      },
    ],
  });
}

describe('POST/GET /api/webhooks/whatsapp — integración end-to-end', () => {
  beforeEach(async () => {
    await createScoped(MetaIntegration, TENANT_ID, {
      canal: 'whatsapp',
      wabaId: 'waba-1',
      phoneNumberId: PHONE_NUMBER_ID,
      accessTokenEnc: 'enc-placeholder',
      activo: true,
    });
    vi.mocked(inboundQueue.add).mockClear();
  });

  it('firma válida → 200 y encola el job con { tenantId, payload }', async () => {
    const raw = buildPayload();

    const res = await request(app)
      .post('/api/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(raw))
      .send(raw);

    expect(res.status).toBe(200);
    // Da tiempo al `enqueueInboundJob` asíncrono que corre después del `res.sendStatus(200)`.
    await new Promise((r) => setTimeout(r, 50));
    expect(inboundQueue.add).toHaveBeenCalledTimes(1);
    const [, jobData] = vi.mocked(inboundQueue.add).mock.calls[0]!;
    expect(jobData).toMatchObject({ tenantId: TENANT_ID.toString() });
  });

  it('firma inválida → 403 y NO encola nada', async () => {
    const raw = buildPayload();

    const res = await request(app)
      .post('/api/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=firma-incorrecta')
      .send(raw);

    expect(res.status).toBe(403);
    await new Promise((r) => setTimeout(r, 50));
    expect(inboundQueue.add).not.toHaveBeenCalled();
  });

  it('phone_number_id sin MetaIntegration → 200 (SLA de Meta) y sin encolar', async () => {
    const raw = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-x',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '000', phone_number_id: 'sin-integrar' },
                messages: [],
              },
            },
          ],
        },
      ],
    });

    const res = await request(app)
      .post('/api/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(raw))
      .send(raw);

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(inboundQueue.add).not.toHaveBeenCalled();
  });

  it('GET con hub.verify_token válido → 200 y devuelve el challenge', async () => {
    const res = await request(app)
      .get('/api/webhooks/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '999888' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('999888');
  });

  it('GET con hub.verify_token inválido → 403', async () => {
    const res = await request(app)
      .get('/api/webhooks/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'incorrecto', 'hub.challenge': '999888' });

    expect(res.status).toBe(403);
  });
});
