import type { MessageStatus } from '../../features/message/message.types.js';
import type {
  IWebhookValue,
  IWhatsAppMedia,
  IWhatsAppMessage,
  IWhatsAppStatus,
} from '../../features/webhook/webhook.types.js';

export function parseDeliveryStatuses(
  value: IWebhookValue,
): Array<{ metaMessageId: string; status: MessageStatus }> {
  if (!value.statuses) return [];
  return value.statuses.map((s: IWhatsAppStatus) => ({
    metaMessageId: s.id,
    status: s.status as MessageStatus,
  }));
}

/** Claves bajo las que Meta anida un objeto de media, en el orden en que se buscan. */
const CLAVES_MEDIA = ['image', 'video', 'audio', 'document', 'sticker'] as const;

/**
 * El objeto de media del mensaje, o `null` si no lleva.
 *
 * Se busca por las claves conocidas en vez de por `msg[msg.type]` para que un `type` inesperado no
 * acabe leyendo una propiedad arbitraria del payload.
 */
export function extraerMedia(msg: IWhatsAppMessage): IWhatsAppMedia | null {
  for (const clave of CLAVES_MEDIA) {
    const media = msg[clave];
    if (media?.id) return media;
  }
  return null;
}

/**
 * El texto del mensaje: el cuerpo si es texto, el pie de foto si es media.
 *
 * Unificarlos es deliberado. Para la bandeja, el resumen por IA y la extracción de datos, lo que
 * el cliente escribió junto a una foto vale exactamente lo mismo que si lo hubiera mandado suelto;
 * guardarlo en un campo aparte obligaría a todos esos consumidores a mirar en dos sitios.
 */
export function extraerTexto(msg: IWhatsAppMessage): string | undefined {
  const cuerpo = msg.text?.body;
  if (cuerpo) return cuerpo;
  return extraerMedia(msg)?.caption;
}
