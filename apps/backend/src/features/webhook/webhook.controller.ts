import type { Request, Response, RequestHandler } from 'express';
import { logger } from '../../utils/logger.js';
import { verifyChallenge, validateHmacSignature, encolarCambio } from './webhook.service.js';
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

  // Si esto no es un Buffer, algún parser global se adelantó al `express.raw` del router y el
  // cuerpo crudo se perdió: sin los bytes exactos no hay forma de validar la firma de Meta. Es la
  // huella de HT-WA-02, así que el log lo dice con todas las letras — hacia fuera se responde
  // igual que ante una firma inválida, porque a un tercero no se le explica por qué se le rechaza.
  if (!Buffer.isBuffer(req.body)) {
    logger.error(
      'Webhook recibido con el cuerpo ya parseado: revisa el orden de middlewares en app.ts ' +
        '(el webhook debe montarse ANTES de express.json())',
    );
    res.status(403).json({ message: 'Firma inválida.' });
    return;
  }
  const rawBody: Buffer = req.body;

  logger.info('Webhook POST recibido', { hasSignature: !!signature, bytes: rawBody?.length ?? 0 });

  if (!validateHmacSignature(rawBody, signature)) {
    logger.warn('Webhook: firma HMAC inválida, revisar META_APP_SECRET', {
      hasSignature: !!signature,
    });
    res.status(403).json({ message: 'Firma inválida.' });
    return;
  }

  res.sendStatus(200);

  let payload: IWhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString()) as IWhatsAppWebhookPayload;
  } catch (err) {
    logger.error('Webhook con cuerpo que no es JSON', { error: String(err) });
    return;
  }

  // Cada cambio va en su propio try: uno roto (o de un campo que no conocemos) no puede dejar sin
  // procesar los demás del mismo payload (HT-WA-04, criterio 5).
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      try {
        await encolarCambio(entry.id, change, payload);
      } catch (err) {
        logger.error('Error procesando un cambio del webhook', {
          field: (change as { field?: unknown }).field,
          error: String(err),
        });
      }
    }
  }
};
