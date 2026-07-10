import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  iaSchema,
  listConversationsSchema,
  readSchema,
  replySchema,
  threadSchema,
} from './conversation.validation.js';
import {
  getThreadController,
  listConversationsController,
  markReadController,
  replyController,
  setIaController,
} from './conversation.controller.js';

const router = Router();

const bandejaRoles = authorize(['coordinador', 'asesor']);

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(listConversationsSchema),
  asyncHandler(listConversationsController),
);

router.get(
  '/:id/messages',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(threadSchema),
  asyncHandler(getThreadController),
);

router.post(
  '/:id/messages',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(replySchema),
  asyncHandler(replyController),
);

router.patch(
  '/:id/read',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(readSchema),
  asyncHandler(markReadController),
);

router.patch(
  '/:id/ia',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(iaSchema),
  asyncHandler(setIaController),
);

export default router;
