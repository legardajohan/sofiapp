import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  getHandoffSettingsSchema,
  updateHandoffSettingsSchema,
} from './ai-handoff.validation.js';
import {
  getHandoffSettingsController,
  updateHandoffSettingsController,
} from './ai-handoff.controller.js';

const router = Router();

// Cuándo el bot deja de contestar es una decisión de negocio, no de operación: solo admin.
const handoffRoles = authorize(['admin']);

// Sin POST ni DELETE a propósito: es UN documento de configuración por empresa, no una colección
// de reglas. `PUT` guarda la configuración completa, que es como la edita el panel.
router.get(
  '/',
  authenticateJWT,
  requireTenant,
  handoffRoles,
  validate(getHandoffSettingsSchema),
  asyncHandler(getHandoffSettingsController),
);

router.put(
  '/',
  authenticateJWT,
  requireTenant,
  handoffRoles,
  validate(updateHandoffSettingsSchema),
  asyncHandler(updateHandoffSettingsController),
);

export default router;
