import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { sendSchema, sendTemplateSchema } from './message.validation.js';
import { sendController, sendTemplateController } from './message.controller.js';

const router = Router();

router.post(
  '/send',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(sendSchema),
  asyncHandler(sendController),
);

router.post(
  '/template',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(sendTemplateSchema),
  asyncHandler(sendTemplateController),
);

export default router;
