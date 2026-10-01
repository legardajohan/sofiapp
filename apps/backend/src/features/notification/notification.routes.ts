import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { listNotificationsSchema, readAllSchema, readOneSchema } from './notification.validation.js';
import {
  listNotificationsController,
  markAllReadController,
  markReadController,
  unreadCountController,
} from './notification.controller.js';

const router = Router();

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(listNotificationsSchema),
  asyncHandler(listNotificationsController),
);

router.get('/unread-count', authenticateJWT, requireTenant, authorize(['admin']), asyncHandler(unreadCountController));

router.patch(
  '/read-all',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(readAllSchema),
  asyncHandler(markAllReadController),
);

router.patch(
  '/:id/read',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(readOneSchema),
  asyncHandler(markReadController),
);

export default router;
