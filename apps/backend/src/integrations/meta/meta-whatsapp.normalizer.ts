import type { MessageStatus } from '../../features/message/message.types.js';
import type { IWebhookValue, IWhatsAppStatus } from '../../features/webhook/webhook.types.js';

export function parseDeliveryStatuses(
  value: IWebhookValue,
): Array<{ metaMessageId: string; status: MessageStatus }> {
  if (!value.statuses) return [];
  return value.statuses.map((s: IWhatsAppStatus) => ({
    metaMessageId: s.id,
    status: s.status as MessageStatus,
  }));
}
