import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  listTenantsSchema,
  createTenantSchema,
  updateTenantSchema,
  updateTenantStatusSchema,
} from './tenant.validation.js';
import {
  listTenantsController,
  createTenantController,
  updateTenantController,
  updateTenantStatusController,
} from './tenant.controller.js';

const router: ExpressRouter = Router();

// Rutas de Superadmin: authenticateJWT → authorize(['superadmin']) → validate → asyncHandler
// SIN requireTenant (superadmin no pertenece a ningún tenant)

router.get(
  '/',
  authenticateJWT,
  authorize(['superadmin']),
  validate(listTenantsSchema),
  asyncHandler(listTenantsController)
);

router.post(
  '/',
  authenticateJWT,
  authorize(['superadmin']),
  validate(createTenantSchema),
  asyncHandler(createTenantController)
);

router.patch(
  '/:id',
  authenticateJWT,
  authorize(['superadmin']),
  validate(updateTenantSchema),
  asyncHandler(updateTenantController)
);

router.patch(
  '/:id/status',
  authenticateJWT,
  authorize(['superadmin']),
  validate(updateTenantStatusSchema),
  asyncHandler(updateTenantStatusController)
);

export default router;
