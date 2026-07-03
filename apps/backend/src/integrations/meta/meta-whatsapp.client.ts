import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import type { IMessagingProvider } from './messaging-provider.interface.js';

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
      text: { body: text },
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
