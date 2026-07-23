import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  createAdminProfileSchema,
  updateAdminProfileSchema,
  adminProfileIdParamSchema,
} from './admin-profile.validation.js';
import {
  getBaseProfilesController,
  listAdminProfilesController,
  createAdminProfileController,
  updateAdminProfileController,
  deleteAdminProfileController,
} from './admin-profile.controller.js';

const router: ExpressRouter = Router();

// Catálogo BASE global (solo lectura): lo usa el superadmin (configura planes) y el admin (referencia).
// Es tenant-agnóstico → SIN requireTenant. Se registra antes que /:id.
router.get(
  '/base',
  authenticateJWT,
  authorize(['superadmin', 'admin']),
  asyncHandler(getBaseProfilesController),
);

// Etiquetas PROPIAS del tenant (tenant-aware): tenantId del token, acceso vía *Scoped.
// Cadena: authenticateJWT → requireTenant → authorize(['admin']) → validate → asyncHandler
router.get(
  '/',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  asyncHandler(listAdminProfilesController),
);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(createAdminProfileSchema),
  asyncHandler(createAdminProfileController),
);

router.patch(
  '/:id',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(updateAdminProfileSchema),
  asyncHandler(updateAdminProfileController),
);

router.delete(
  '/:id',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(adminProfileIdParamSchema),
  asyncHandler(deleteAdminProfileController),
);

export default router;
