import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import type { IMessagingProvider } from './messaging-provider.interface.js';
import type { TipoMediaSaliente } from '../../features/media/media.types.js';

/** Dominio → nombre del tipo en la Cloud API. */
const TIPO_META: Record<TipoMediaSaliente, 'image' | 'video' | 'document'> = {
  imagen: 'image',
  video: 'video',
  documento: 'document',
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function graphRequest(
  phoneNumberId: string,
  accessToken: string,
  body: Record<string, unknown>,
  attempt = 0,
): Promise<{ messages: Array<{ id: string }> }> {
  const url = `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429 && attempt < MAX_RETRIES) {
    const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
    logger.warn('Meta API rate limited, retrying', { attempt, delay });
    await new Promise((r) => setTimeout(r, delay));
    return graphRequest(phoneNumberId, accessToken, body, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new AppError(`Error Graph API (${res.status}): ${text}`, 502);
  }

  return res.json() as Promise<{ messages: Array<{ id: string }> }>;
}

export const metaWhatsAppClient: IMessagingProvider = {
  async sendText(to, text, phoneNumberId, accessToken) {
    const data = await graphRequest(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      // `preview_url: true` es lo que hace que WhatsApp renderice la tarjeta rica del enlace EN EL
      // TELÉFONO DEL CLIENTE. Del lado receptor no podemos: la Cloud API no manda metadata Open
      // Graph en los webhooks entrantes, así que nuestra tarjeta se queda en dominio + URL.
      // Meta lo ignora si el texto no lleva ninguna URL, así que no hay que condicionarlo.
      text: { body: text, preview_url: true },
    });
    const first = data.messages[0];
    if (!first) throw new AppError('Meta API no devolvió ID de mensaje.', 502);
    return { messageId: first.id };
  },

  async sendMedia(to, tipo, mediaId, opciones, phoneNumberId, accessToken) {
    const tipoMeta = TIPO_META[tipo];

    const data = await graphRequest(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to,
      type: tipoMeta,
      [tipoMeta]: {
        id: mediaId,
        // El caption solo lo aceptan image, video y document. En audio o sticker, mandarlo hace
        // que Meta responda 400, así que el llamador lo descarta antes de llegar aquí.
        ...(opciones.caption ? { caption: opciones.caption } : {}),
        // `filename` solo aplica a document: es el nombre que ve el destinatario al descargar.
        ...(tipoMeta === 'document' && opciones.filename ? { filename: opciones.filename } : {}),
      },
    });

    const first = data.messages[0];
    if (!first) throw new AppError('Meta API no devolvió ID de mensaje.', 502);
    return { messageId: first.id };
  },

  async sendTemplate(to, templateName, langCode, components, phoneNumberId, accessToken) {
    const data = await graphRequest(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: templateName, language: { code: langCode }, components },
    });
    const first = data.messages[0];
    if (!first) throw new AppError('Meta API no devolvió ID de mensaje.', 502);
    return { messageId: first.id };
  },
};
