import { createHmac } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';

/**
 * HT-WA-04 — el webhook `message_template_status_update`, a nivel HTTP.
 *
 * Dos cosas que solo se ven cruzando la capa HTTP: que el evento de plantilla se encola con el
 * tenant de la WABA (`entry.id`), y que un payload que mezcla mensajes y plantillas ya no tumba el
 * procesamiento de los mensajes (antes, el cambio de plantilla sin `metadata` lanzaba un TypeError
 * y se perdía todo lo que venía detrás).
 */
const { mockInboundAdd, mockTemplateAdd } = vi.hoisted(() => ({
  mockInboundAdd: vi.fn(),
  mockTemplateAdd: vi.fn(),
}));
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
  TEMPLATE_STATUS_JOB: 'status-update',
  inboundQueue: { add: mockInboundAdd },
  templateQueue: { add: mockTemplateAdd },
  aiReplyQueue: { add: vi.fn().mockResolvedValue(undefined) },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
  flowRuntimeQueue: { add: vi.fn().mockResolvedValue(undefined), upsertJobScheduler: vi.fn() },
}));

import app from '../../app.js';
import { env } from '../../config/env.js';
import { MetaIntegration } from '../channel/channel.model.js';

const PHONE_NUMBER_ID = '333333333333333';

function firmar(cuerpo: string): string {
  return `sha256=${createHmac('sha256', env.META_APP_SECRET ?? '').update(cuerpo).digest('hex')}`;
}

function postWebhook(cuerpo: string): request.Test {
  return request(app)
    .post('/api/webhooks/whatsapp')
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', firmar(cuerpo))
    .send(cuerpo);
}

function cambioPlantilla(event: string, reason: string | null = null): unknown {
  return {
    field: 'message_template_status_update',
    value: {
      event,
      message_template_id: 1234567890,
      message_template_name: 'promo_mes',
      message_template_language: 'es',
      reason,
    },
  };
}

function cambioMensaje(): unknown {
  return {
    field: 'messages',
    value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '+573001112233', phone_number_id: PHONE_NUMBER_ID },
      messages: [
        { from: '573009998877', id: 'wamid.x', timestamp: '1750000000', type: 'text', text: { body: 'Hola' } },
      ],
    },
  };
}

async function sembrar(tenantId: Types.ObjectId, wabaId: string, phoneNumberId: string): Promise<void> {
  await MetaIntegration.create({
    tenantId,
    canal: 'whatsapp',
    wabaId,
    phoneNumberId,
    accessTokenEnc: 'token-cifrado-de-prueba',
    activo: true,
  });
}

beforeEach(() => {
  mockInboundAdd.mockReset().mockResolvedValue(undefined);
  mockTemplateAdd.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/webhooks/whatsapp — message_template_status_update', () => {
  it('encola el evento con el tenant de la WABA, el id de Meta como string y el motivo', async () => {
    const tenantId = new Types.ObjectId();
    await sembrar(tenantId, 'waba-plantillas', PHONE_NUMBER_ID);
    const cuerpo = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba-plantillas', changes: [cambioPlantilla('REJECTED', 'INVALID_FORMAT')] }],
    });

    const res = await postWebhook(cuerpo);

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(mockTemplateAdd).toHaveBeenCalledTimes(1));
    expect(mockTemplateAdd.mock.calls[0]![0]).toBe('status-update');
    expect(mockTemplateAdd.mock.calls[0]![1]).toEqual({
      tenantId: tenantId.toString(),
      metaTemplateId: '1234567890',
      evento: 'REJECTED',
      motivo: 'INVALID_FORMAT',
    });
    expect(mockInboundAdd).not.toHaveBeenCalled();
  });

  it('un payload mixto encola el mensaje Y el evento de plantilla: uno no tumba al otro', async () => {
    const tenantId = new Types.ObjectId();
    await sembrar(tenantId, 'waba-mixta', PHONE_NUMBER_ID);
    const cuerpo = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba-mixta', changes: [cambioPlantilla('APPROVED'), cambioMensaje()] }],
    });

    const res = await postWebhook(cuerpo);

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(mockTemplateAdd).toHaveBeenCalledTimes(1);
      expect(mockInboundAdd).toHaveBeenCalledTimes(1);
    });
  });

  it('una WABA sin tenant no encola nada, y otra empresa no recibe el evento', async () => {
    const otroTenant = new Types.ObjectId();
    await sembrar(otroTenant, 'waba-de-otro', '444444444444444');
    const cuerpo = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba-desconocida', changes: [cambioPlantilla('APPROVED')] }],
    });

    const res = await postWebhook(cuerpo);

    expect(res.status).toBe(200);
    // Margen para que el trabajo posterior al 200 termine antes de afirmar que no pasó nada.
    await new Promise((r) => setTimeout(r, 100));
    expect(mockTemplateAdd).not.toHaveBeenCalled();
  });
});
