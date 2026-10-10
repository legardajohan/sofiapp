import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../config/env.js';
import { TEMPLATE_STATUS_JOB, inboundQueue, templateQueue } from '../../config/queues.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/AppError.js';
import { MetaIntegration } from '../channel/channel.model.js';
import type { IMetaIntegrationDocument } from '../channel/channel.types.js';
import type { TemplateStatusJobData } from '../whatsapp-template/whatsapp-template.types.js';
import type {
  ITemplateStatusValue,
  IWebhookChange,
  IWhatsAppWebhookPayload,
} from './webhook.types.js';

export function verifyChallenge(query: Record<string, string>): string {
  const verifyToken = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (!env.META_VERIFY_TOKEN || verifyToken !== env.META_VERIFY_TOKEN) {
    throw new AppError('Token de verificación inválido.', 403);
  }
  if (!challenge) throw new AppError('Challenge ausente.', 400);
  return challenge;
}

export function validateHmacSignature(rawBody: Buffer, signature: string): boolean {
  if (!env.META_APP_SECRET) return false;
  try {
    // El `createHmac` va DENTRO del try: si `rawBody` no es un Buffer —el escenario de HT-WA-02,
    // cuando un parser global se adelantaba y dejaba un objeto— `update()` lanza
    // ERR_INVALID_ARG_TYPE. Dejarlo propagar es lo que colgaba la petición y dejaba a Meta sin
    // respuesta. Un cuerpo que no se puede firmar no es una firma válida: se devuelve `false`.
    const expected = `sha256=${createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest('hex')}`;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function resolveWebhookTenant(
  phoneNumberId: string,
): Promise<IMetaIntegrationDocument | null> {
  return MetaIntegration.findOne({ phoneNumberId }).lean<IMetaIntegrationDocument>();
}

/**
 * Tenant de un evento de plantilla (HT-WA-04). **Extensión documentada de la excepción del
 * webhook** (regla 2 del `CLAUDE.md`): `message_template_status_update` no trae `phone_number_id`,
 * solo la WABA en `entry.id`. Es la misma lectura global que la de arriba, por otra clave, y nunca
 * con datos del cuerpo que no estén firmados por Meta (el HMAC ya se validó).
 */
export async function resolveWebhookTenantByWaba(
  wabaId: string,
): Promise<IMetaIntegrationDocument | null> {
  return MetaIntegration.findOne({ wabaId }).lean<IMetaIntegrationDocument>();
}

/**
 * `processor` es idempotente (dedupe por `metaMessageId` scoped al tenant), así que reintentar
 * ante un fallo transitorio de Mongo es seguro y evita perder el mensaje para siempre.
 */
const INBOUND_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export async function enqueueInboundJob(
  tenantId: string,
  payload: IWhatsAppWebhookPayload,
): Promise<void> {
  await inboundQueue.add('process', { tenantId, payload }, INBOUND_JOB_OPTS);
}

const TEMPLATE_STATUS_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export async function enqueueTemplateStatusJob(
  tenantId: string,
  value: ITemplateStatusValue,
): Promise<void> {
  const data: TemplateStatusJobData = {
    tenantId,
    metaTemplateId: String(value.message_template_id),
    evento: value.event,
    motivo: value.reason ?? null,
  };
  await templateQueue.add(TEMPLATE_STATUS_JOB, data, TEMPLATE_STATUS_JOB_OPTS);
}

/**
 * Encola un cambio del webhook en la cola que le toca según su `field` (HT-WA-04). El controller
 * ya respondió 200: aquí solo se resuelve el tenant y se delega el trabajo a BullMQ.
 */
export async function encolarCambio(
  entryId: string,
  change: IWebhookChange,
  payload: IWhatsAppWebhookPayload,
): Promise<void> {
  if (change.field === 'messages') {
    const phoneNumberId = change.value.metadata.phone_number_id;
    const integration = await resolveWebhookTenant(phoneNumberId);
    if (!integration) {
      logger.warn('phone_number_id sin tenant asociado', { phoneNumberId });
      return;
    }
    await enqueueInboundJob(integration.tenantId.toString(), payload);
    return;
  }

  if (change.field === 'message_template_status_update') {
    const integration = await resolveWebhookTenantByWaba(entryId);
    if (!integration) {
      logger.warn('WABA sin tenant asociado', { wabaId: entryId });
      return;
    }
    await enqueueTemplateStatusJob(integration.tenantId.toString(), change.value);
    return;
  }

  logger.info('Campo del webhook sin manejar', { field: (change as { field?: unknown }).field });
}
