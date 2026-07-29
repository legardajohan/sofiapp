import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  createTagSchema,
  deleteTagSchema,
  listTagsSchema,
  updateTagSchema,
} from './tag.validation.js';
import {
  createTagController,
  deleteTagController,
  listTagsController,
  updateTagController,
} from './tag.controller.js';

const router = Router();

// Mismos roles que la bandeja: las etiquetas se gestionan y se aplican desde ahí.
const etiquetaRoles = authorize(['admin']);

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  etiquetaRoles,
  validate(listTagsSchema),
  asyncHandler(listTagsController),
);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  etiquetaRoles,
  validate(createTagSchema),
  asyncHandler(createTagController),
);

router.patch(
  '/:id',
  authenticateJWT,
  requireTenant,
  etiquetaRoles,
  validate(updateTagSchema),
  asyncHandler(updateTagController),
);

router.delete(
  '/:id',
  authenticateJWT,
  requireTenant,
  etiquetaRoles,
  validate(deleteTagSchema),
  asyncHandler(deleteTagController),
);

export default router;
