import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { getAiResponseContextSchema, listAiResponsesSchema } from './ai.validation.js';
import { getAiResponseContextController, listAiResponsesController } from './ai.controller.js';

const router = Router();

// Auditoría de respuestas de IA (HU-KB-04): solo admin, cross-endpoint del tenant.
const aiRoles = authorize(['admin']);

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  aiRoles,
  validate(listAiResponsesSchema),
  asyncHandler(listAiResponsesController),
);

router.get(
  '/:id/context',
  authenticateJWT,
  requireTenant,
  aiRoles,
  validate(getAiResponseContextSchema),
  asyncHandler(getAiResponseContextController),
);

export default router;
