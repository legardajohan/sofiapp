import { createHmac } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';

// Mock de las colas BullMQ: evita conexión a Redis al importar `app`, y deja `inboundQueue.add`
// observable, que es la prueba de que el entrante llegó a destino.
const { mockInboundAdd } = vi.hoisted(() => ({ mockInboundAdd: vi.fn() }));
vi.mock('../../config/queues.js', () => ({
  INBOUND_QUEUE_NAME: 'inbound-messages',
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  AI_REPLY_QUEUE_NAME: 'ai-reply',
  AI_REPLY_JOB_NAME: 'auto-reply',
  FLOW_RUNTIME_QUEUE_NAME: 'flow-runtime',
  FLOW_RESUME_JOB: 'resume',
  FLOW_REMINDER_JOB: 'reminder',
  REMINDER_SWEEP_JOB: 'sweep',
  REMINDER_SWEEP_SCHEDULER_ID: 'reminder-sweep',
  inboundQueue: { add: mockInboundAdd },
  aiReplyQueue: { add: vi.fn().mockResolvedValue(undefined) },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
  flowRuntimeQueue: { add: vi.fn().mockResolvedValue(undefined), upsertJobScheduler: vi.fn() },
}));

import app from '../../app.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { MetaIntegration } from '../channel/channel.model.js';

/**
 * Test de regresión de HT-WA-02, a nivel HTTP.
 *
 * El bug (un `express.json()` global montado antes del webhook se comía el cuerpo, y el
 * `express.raw` del router ya no podía entregar el Buffer que necesita el HMAC) vivía en el
 * MONTAJE, no en ninguna función. Por eso `tests/unit/webhook.service.test.ts` lo dejaba pasar:
 * probaba la función correcta, con el tipo correcto, sin cruzar nunca la capa HTTP.
 *
 * Cualquier test que no levante `app` con supertest volvería a no verlo.
 */

const PHONE_NUMBER_ID = '111111111111111';
const OTRO_PHONE_NUMBER_ID = '222222222222222';

function payloadDe(phoneNumberId: string): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '+573001112233', phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: 'Prospecto' }, wa_id: '573009998877' }],
              messages: [
                {
                  from: '573009998877',
                  id: 'wamid.test',
                  timestamp: '1750000000',
                  type: 'text',
                  text: { body: '¿A qué hora abren?' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/**
 * Firma los bytes EXACTOS que se van a enviar.
 *
 * Se serializa una sola vez y se manda esa misma cadena con `.send(...)`: si se dejara que
 * supertest serializara el objeto por su cuenta, los bytes firmados podrían no ser los enviados y
 * el test pasaría —o fallaría— por el motivo equivocado.
 */
function firmar(cuerpo: string): string {
  return `sha256=${createHmac('sha256', env.META_APP_SECRET ?? '').update(cuerpo).digest('hex')}`;
}

/** Emula a Meta: JSON crudo + cabecera de firma. */
function postWebhook(cuerpo: string, firma: string | null): request.Test {
  const req = request(app)
    .post('/api/webhooks/whatsapp')
    .set('Content-Type', 'application/json');
  if (firma !== null) req.set('X-Hub-Signature-256', firma);
  return req.send(cuerpo);
}

async function sembrarIntegracion(
  tenantId: Types.ObjectId,
  phoneNumberId: string,
): Promise<void> {
  await MetaIntegration.create({
    tenantId,
    canal: 'whatsapp',
    wabaId: `waba-${phoneNumberId}`,
    phoneNumberId,
    accessTokenEnc: 'token-cifrado-de-prueba',
    activo: true,
  });
}

/**
 * El controller responde `200` y SIGUE trabajando (resolver tenant + encolar), que es la regla del
 * repo para los webhooks de Meta. Supertest vuelve en cuanto llega la respuesta, así que hay que
 * esperar a que ese trabajo posterior termine antes de mirar la cola.
 */
async function esperarEncolado(veces = 1): Promise<void> {
  await vi.waitFor(() => expect(mockInboundAdd).toHaveBeenCalledTimes(veces));
}

beforeEach(() => {
  mockInboundAdd.mockReset();
  mockInboundAdd.mockResolvedValue(undefined);
});

// ─── POST: recepción de eventos ───────────────────────────────────────────────
describe('POST /api/webhooks/whatsapp', () => {
  it('entrante con firma correcta → 200 y job encolado con el tenant del phone_number_id', async () => {
    // EL CASO QUE MOTIVÓ HT-WA-02: contra el código anterior esta petición quedaba colgada.
    const tenantId = new Types.ObjectId();
    await sembrarIntegracion(tenantId, PHONE_NUMBER_ID);
    const cuerpo = JSON.stringify(payloadDe(PHONE_NUMBER_ID));

    const res = await postWebhook(cuerpo, firmar(cuerpo));

    expect(res.status).toBe(200);
    await esperarEncolado();
    const [nombreJob, data] = mockInboundAdd.mock.calls[0] as [string, { tenantId: string }];
    expect(nombreJob).toBe('process');
    expect(data.tenantId).toBe(tenantId.toString());
  });

  it('el payload llega íntegro al job, no una versión reserializada', async () => {
    const tenantId = new Types.ObjectId();
    await sembrarIntegracion(tenantId, PHONE_NUMBER_ID);
    const cuerpo = JSON.stringify(payloadDe(PHONE_NUMBER_ID));

    await postWebhook(cuerpo, firmar(cuerpo));
    await esperarEncolado();

    const [, data] = mockInboundAdd.mock.calls[0] as [string, { payload: unknown }];
    expect(data.payload).toEqual(JSON.parse(cuerpo));
  });

  it('firma incorrecta → 403 y no encola nada', async () => {
    await sembrarIntegracion(new Types.ObjectId(), PHONE_NUMBER_ID);
    const cuerpo = JSON.stringify(payloadDe(PHONE_NUMBER_ID));

    const res = await postWebhook(cuerpo, 'sha256=firma-que-no-es');

    expect(res.status).toBe(403);
    expect(mockInboundAdd).not.toHaveBeenCalled();
  });

  it('sin cabecera de firma → 403, y responde (no se queda colgado)', async () => {
    await sembrarIntegracion(new Types.ObjectId(), PHONE_NUMBER_ID);
    const cuerpo = JSON.stringify(payloadDe(PHONE_NUMBER_ID));

    const res = await postWebhook(cuerpo, null);

    expect(res.status).toBe(403);
    expect(mockInboundAdd).not.toHaveBeenCalled();
  });

  it('phone_number_id sin integración → 200 igualmente, para que Meta no reintente', async () => {
    // Que no sepamos de quién es el número no es un fallo de Meta: reintentarlo no arregla nada.
    // Se espera al `warn` en vez de asumir un tiempo: así el "no encoló" se comprueba DESPUÉS de
    // que el camino asíncrono terminó, y no antes de que llegara a ejecutarse.
    const warn = vi.spyOn(logger, 'warn');
    const cuerpo = JSON.stringify(payloadDe('999999999999999'));

    const res = await postWebhook(cuerpo, firmar(cuerpo));

    expect(res.status).toBe(200);
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        'phone_number_id sin tenant asociado',
        expect.objectContaining({ phoneNumberId: '999999999999999' }),
      ),
    );
    expect(mockInboundAdd).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ─── Aislamiento multi-tenant ─────────────────────────────────────────────────
describe('webhook — aislamiento multi-tenant', () => {
  it('el tenant sale del phone_number_id recibido, nunca del otro que existe', async () => {
    // El webhook es la ÚNICA excepción documentada del aislamiento (docs/multi-tenancy.md): aquí el
    // tenant no puede venir del token porque no hay token. Este test fija ese contrato.
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    await sembrarIntegracion(tenantA, PHONE_NUMBER_ID);
    await sembrarIntegracion(tenantB, OTRO_PHONE_NUMBER_ID);

    const cuerpo = JSON.stringify(payloadDe(OTRO_PHONE_NUMBER_ID));
    await postWebhook(cuerpo, firmar(cuerpo));
    await esperarEncolado();

    const [, data] = mockInboundAdd.mock.calls[0] as [string, { tenantId: string }];
    expect(data.tenantId).toBe(tenantB.toString());
    expect(data.tenantId).not.toBe(tenantA.toString());
  });

  it('cada número enruta a su propio tenant', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    await sembrarIntegracion(tenantA, PHONE_NUMBER_ID);
    await sembrarIntegracion(tenantB, OTRO_PHONE_NUMBER_ID);

    const cuerpoA = JSON.stringify(payloadDe(PHONE_NUMBER_ID));
    await postWebhook(cuerpoA, firmar(cuerpoA));
    await esperarEncolado(1);
    const cuerpoB = JSON.stringify(payloadDe(OTRO_PHONE_NUMBER_ID));
    await postWebhook(cuerpoB, firmar(cuerpoB));
    await esperarEncolado(2);

    const tenantsUsados = mockInboundAdd.mock.calls.map(
      (call) => (call as [string, { tenantId: string }])[1].tenantId,
    );
    expect(tenantsUsados).toEqual([tenantA.toString(), tenantB.toString()]);
  });
});

// ─── GET: verificación de la suscripción ──────────────────────────────────────
describe('GET /api/webhooks/whatsapp', () => {
  it('token correcto → 200 con el challenge', async () => {
    const res = await request(app).get('/api/webhooks/whatsapp').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': env.META_VERIFY_TOKEN ?? '',
      'hub.challenge': '1234567',
    });

    expect(res.status).toBe(200);
    expect(res.text).toBe('1234567');
  });

  it('token incorrecto → 403', async () => {
    const res = await request(app).get('/api/webhooks/whatsapp').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'token-equivocado',
      'hub.challenge': '1234567',
    });

    expect(res.status).toBe(403);
  });
});
