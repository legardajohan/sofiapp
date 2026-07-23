import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { updatePlatformSettingsSchema } from './platform-settings.validation.js';
import {
  getPlatformSettingsController,
  updatePlatformSettingsController,
} from './platform-settings.controller.js';

const router: ExpressRouter = Router();

// Config GLOBAL de plataforma (superadmin, cross-tenant): SIN requireTenant.
// Cadena: authenticateJWT → authorize(['superadmin']) → validate → asyncHandler

router.get(
  '/',
  authenticateJWT,
  authorize(['superadmin']),
  asyncHandler(getPlatformSettingsController),
);

router.patch(
  '/',
  authenticateJWT,
  authorize(['superadmin']),
  validate(updatePlatformSettingsSchema),
  asyncHandler(updatePlatformSettingsController),
);

export default router;
