import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { connectSchema } from './channel.validation.js';
import { connectController, statusController } from './channel.controller.js';

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

export default router;
