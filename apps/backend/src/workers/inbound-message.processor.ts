import { Worker } from 'bullmq';
import { Types } from 'mongoose';
import { INBOUND_QUEUE_NAME } from '../config/queues.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { resolveWebhookTenant } from '../features/webhook/webhook.service.js';
import { upsertByMetaUser } from '../features/cliente/cliente.service.js';
import { saveMessage, updateDeliveryStatus } from '../features/message/message.service.js';
import { parseDeliveryStatuses } from '../integrations/meta/meta-whatsapp.normalizer.js';
import type { IWhatsAppWebhookPayload } from '../features/webhook/webhook.types.js';
import type { TipoMensaje } from '../features/message/message.types.js';

interface InboundJobData {
  tenantId: string;
  payload: IWhatsAppWebhookPayload;
}

function mapMsgType(type: string): TipoMensaje {
  const map: Record<string, TipoMensaje> = {
    text: 'text',
    image: 'image',
    audio: 'audio',
    document: 'document',
  };
  return map[type] ?? 'other';
}

export const inboundMessageProcessor = new Worker<InboundJobData>(
  INBOUND_QUEUE_NAME,
  async (job) => {
    const { payload } = job.data;

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        const phoneNumberId = value.metadata.phone_number_id;

        const integration = await resolveWebhookTenant(phoneNumberId);
        if (!integration) {
          logger.warn('phone_number_id sin tenant asociado', { phoneNumberId });
          continue;
        }

        const tenantId = integration.tenantId.toString();
        const tenantOid = new Types.ObjectId(tenantId);

        for (const msg of value.messages ?? []) {
          const contact = value.contacts?.find((c) => c.wa_id === msg.from);
          const nombre = contact?.profile.name;

          const cliente = await upsertByMetaUser(tenantId, msg.from, msg.from, 'whatsapp', nombre);

          await saveMessage(tenantId, {
            tenantId: tenantOid,
            clienteId: cliente._id as Types.ObjectId,
            canal: 'whatsapp',
            direccion: 'inbound',
            sender: 'user',
            tipo: mapMsgType(msg.type),
            texto: msg.text?.body,
            metaMessageId: msg.id,
            status: 'sent',
          });
        }

        const statuses = parseDeliveryStatuses(value);
        for (const { metaMessageId, status } of statuses) {
          await updateDeliveryStatus(metaMessageId, status);
        }
      }
    }
  },
  { connection: { url: env.REDIS_URL } },
);
