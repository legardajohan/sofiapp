import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { heartbeatSchema } from './activity.validation.js';
import { heartbeatController } from './activity.controller.js';

const router: ExpressRouter = Router();

// HU-REP-06: latido de un asesor con la pestaña visible y en uso. Todo admin late, con o sin
// rol de empresa: el gate de reportes (ADR 0011) aplica a quién LEE el tiempo, no a quién lo genera.
router.post(
  '/heartbeat',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(heartbeatSchema),
  asyncHandler(heartbeatController),
);

export default router;
