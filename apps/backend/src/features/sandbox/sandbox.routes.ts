import { Router } from 'express';
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
  advanceWaitSchema,
  getSessionSchema,
  resetSessionSchema,
  selectFlowSchema,
  sendMessageSchema,
} from './sandbox.validation.js';
import {
  advanceWaitController,
  getSessionController,
  resetSessionController,
  selectFlowController,
  sendMessageController,
} from './sandbox.controller.js';

const router = Router();

// El chat de prueba ejecuta de verdad el flujo y a Sofi del tenant: es una herramienta de
// configuración, solo admin.
const sandboxRoles = authorize(['admin']);

router.get(
  '/session',
  authenticateJWT,
  requireTenant,
  sandboxRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(getSessionSchema),
  asyncHandler(getSessionController),
);

router.put(
  '/session',
  authenticateJWT,
  requireTenant,
  sandboxRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(selectFlowSchema),
  asyncHandler(selectFlowController),
);

router.post(
  '/session/reset',
  authenticateJWT,
  requireTenant,
  sandboxRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(resetSessionSchema),
  asyncHandler(resetSessionController),
);

router.post(
  '/session/advance-wait',
  authenticateJWT,
  requireTenant,
  sandboxRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(advanceWaitSchema),
  asyncHandler(advanceWaitController),
);

router.post(
  '/messages',
  authenticateJWT,
  requireTenant,
  sandboxRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(sendMessageSchema),
  asyncHandler(sendMessageController),
);

export default router;
