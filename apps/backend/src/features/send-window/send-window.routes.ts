import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import {
  authorizeRolEmpresa,
  ROLES_CONFIGURACION,
} from '../../middlewares/authorize-rol-empresa.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  getSendWindowSchema,
  holidaysPreviewSchema,
  updateSendWindowSchema,
} from './send-window.validation.js';
import {
  getSendWindowController,
  getSendWindowStatusController,
  previewHolidaysController,
  updateSendWindowController,
} from './send-window.controller.js';

const router: ExpressRouter = Router();

// Configuración del tenant (HU-CONF-01): solo `admin`, como el resto de Configuración.
const soloAdmin = authorize(['admin']);

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  soloAdmin,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(getSendWindowSchema),
  asyncHandler(getSendWindowController),
);

router.put(
  '/',
  authenticateJWT,
  requireTenant,
  soloAdmin,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(updateSendWindowSchema),
  asyncHandler(updateSendWindowController),
);

router.get(
  '/status',
  authenticateJWT,
  requireTenant,
  soloAdmin,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(getSendWindowSchema),
  asyncHandler(getSendWindowStatusController),
);

router.post(
  '/holidays/preview',
  authenticateJWT,
  requireTenant,
  soloAdmin,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(holidaysPreviewSchema),
  asyncHandler(previewHolidaysController),
);

export default router;
