import { Router } from 'express';
import express from 'express';
import { logger } from '../../utils/logger.js';
import { verifyController, receiveController } from './webhook.controller.js';

const router = Router();

router.get('/', verifyController);

/**
 * `express.raw` aquí es lo que entrega el Buffer que necesita el HMAC, y solo funciona si ningún
 * parser global se adelantó — por eso este router se monta antes de `express.json()` en `app.ts`.
 *
 * No se usa `asyncHandler` a propósito, pese a ser el patrón del repo: `receiveController`
 * responde `200` y SIGUE trabajando, así que el `errorHandler` central intentaría responder por
 * segunda vez. Este `.catch` cubre los dos casos por separado.
 */
router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  receiveController(req, res).catch((err: unknown) => {
    logger.error('Webhook receive error', { error: String(err) });
    // Si reventó DESPUÉS del 200 ya no hay nada que contestar. Si reventó antes, Meta no puede
    // quedarse esperando: una petición colgada dispara la tormenta de reintentos y acaba con la
    // suscripción desactivada, sin dejar rastro de por qué (HT-WA-02).
    if (!res.headersSent) res.status(500).json({ message: 'Error interno del servidor.' });
  });
});

export default router;
