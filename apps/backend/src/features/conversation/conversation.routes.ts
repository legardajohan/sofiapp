import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  assignSchema,
  assignmentsSchema,
  iaSchema,
  listConversationsSchema,
  readSchema,
  replySchema,
  summarySchema,
  tagsSchema,
  threadSchema,
} from './conversation.validation.js';
import {
  assignController,
  generateSummaryController,
  getThreadController,
  listAssignmentsController,
  listConversationsController,
  markReadController,
  replyController,
  setIaController,
  setTagsController,
} from './conversation.controller.js';

const router = Router();

const bandejaRoles = authorize(['admin']);

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

router.post(
  '/:id/summary',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(summarySchema),
  asyncHandler(generateSummaryController),
);

router.patch(
  '/:id/tags',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(tagsSchema),
  asyncHandler(setTagsController),
);

router.patch(
  '/:id/assign',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(assignSchema),
  asyncHandler(assignController),
);

router.get(
  '/:id/assignments',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(assignmentsSchema),
  asyncHandler(listAssignmentsController),
);

export default router;
