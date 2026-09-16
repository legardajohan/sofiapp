import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { connectSchema, syncTierSchema, updateTierSchema } from './channel.validation.js';
import {
  connectController,
  statusController,
  syncTierController,
  updateTierController,
} from './channel.controller.js';

const router = Router();

router.post(
  '/connect',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(connectSchema),
  asyncHandler(connectController),
);

router.get(
  '/status',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  asyncHandler(statusController),
);

// Capacidad de envío del número (HU-MARK-01): el tier y la calidad que gobiernan el pacing de las
// campañas. El `POST` sondea Meta; el `PATCH` es el override para cuando la sonda no responde.
router.post(
  '/tier/sync',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(syncTierSchema),
  asyncHandler(syncTierController),
);

router.patch(
  '/tier',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(updateTierSchema),
  asyncHandler(updateTierController),
);

export default router;
