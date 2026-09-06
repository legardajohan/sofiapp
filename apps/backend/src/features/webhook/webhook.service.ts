import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../config/env.js';
import { inboundQueue } from '../../config/queues.js';
import { AppError } from '../../utils/AppError.js';
import { MetaIntegration } from '../channel/channel.model.js';
import type { IMetaIntegrationDocument } from '../channel/channel.types.js';
import type { IWhatsAppWebhookPayload } from './webhook.types.js';

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

export async function enqueueInboundJob(
  tenantId: string,
  payload: IWhatsAppWebhookPayload,
): Promise<void> {
  await inboundQueue.add('process', { tenantId, payload });
}
