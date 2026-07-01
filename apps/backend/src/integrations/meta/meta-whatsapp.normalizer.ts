import type { ICreateMessageDto, MessageStatus } from '../../features/message/message.types.js';
import type { IWebhookValue, IWhatsAppMessage, IWhatsAppStatus } from '../../features/webhook/webhook.types.js';
import { Types } from 'mongoose';

export function parseInboundEvents(
  value: IWebhookValue,
  clienteId: Types.ObjectId,
  tenantId: Types.ObjectId,
): ICreateMessageDto[] {
  if (!value.messages) return [];
  return value.messages.map((msg: IWhatsAppMessage): ICreateMessageDto => ({
    tenantId,
    clienteId,
    canal: 'whatsapp',
    direccion: 'inbound',
    sender: 'user',
    tipo: mapMsgType(msg.type),
    texto: msg.text?.body,
    metaMessageId: msg.id,
    status: 'sent',
  }));
}

export function parseDeliveryStatuses(
  value: IWebhookValue,
): Array<{ metaMessageId: string; status: MessageStatus }> {
  if (!value.statuses) return [];
  return value.statuses.map((s: IWhatsAppStatus) => ({
    metaMessageId: s.id,
    status: s.status as MessageStatus,
  }));
}

function mapMsgType(type: IWhatsAppMessage['type']): ICreateMessageDto['tipo'] {
  const map: Record<IWhatsAppMessage['type'], ICreateMessageDto['tipo']> = {
    text: 'text',
    image: 'image',
    audio: 'audio',
    document: 'document',
    other: 'other',
  };
  return map[type] ?? 'other';
}
