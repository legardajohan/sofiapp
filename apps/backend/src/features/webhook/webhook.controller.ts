import type { Request, Response, RequestHandler } from 'express';
import { logger } from '../../utils/logger.js';
import {
  verifyChallenge,
  validateHmacSignature,
  resolveWebhookTenant,
  enqueueInboundJob,
} from './webhook.service.js';
import type { IWhatsAppWebhookPayload } from './webhook.types.js';

export const verifyController: RequestHandler = (req, res) => {
  try {
    const challenge = verifyChallenge(req.query as Record<string, string>);
    res.status(200).send(challenge);
  } catch {
    res.status(403).json({ message: 'Verificación fallida.' });
  }
};

export const receiveController = async (req: Request, res: Response): Promise<void> => {
  const signature = (req.headers['x-hub-signature-256'] as string | undefined) ?? '';
  const rawBody = req.body as Buffer;

  if (!validateHmacSignature(rawBody, signature)) {
    res.status(403).json({ message: 'Firma inválida.' });
    return;
  }

  res.sendStatus(200);

  try {
    const payload = JSON.parse(rawBody.toString()) as IWhatsAppWebhookPayload;

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const phoneNumberId = change.value.metadata.phone_number_id;
        const integration = await resolveWebhookTenant(phoneNumberId);
        if (!integration) {
          logger.warn('phone_number_id sin tenant asociado', { phoneNumberId });
          continue;
        }
        await enqueueInboundJob(integration.tenantId.toString(), payload);
      }
    }
  } catch (err) {
    logger.error('Error procesando webhook', { error: String(err) });
  }
};
