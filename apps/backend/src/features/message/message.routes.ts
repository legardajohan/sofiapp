import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { sendSchema } from './message.validation.js';
import { sendController } from './message.controller.js';

const router = Router();

router.post(
  '/send',
  authenticateJWT,
  requireTenant,
  authorize(['asesor', 'coordinador', 'admin']),
  validate(sendSchema),
  asyncHandler(sendController),
);

export default router;
