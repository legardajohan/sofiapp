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
import { getAjustesTenantSchema, updateAjustesTenantSchema } from './tenant.validation.js';
import {
  getAjustesTenantController,
  updateAjustesTenantController,
} from './tenant-ajustes.controller.js';

/**
 * Ajustes que el `admin` de una empresa edita sobre SU empresa (HU-MARK-07). Router aparte de
 * `tenant.routes.ts`, que es del superadmin y no lleva `requireTenant`: aquí el tenant es el del
 * token y no hay `:id` en la ruta.
 */
const router: ExpressRouter = Router();

router.get(
  '/ajustes',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(getAjustesTenantSchema),
  asyncHandler(getAjustesTenantController),
);

router.patch(
  '/ajustes',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(updateAjustesTenantSchema),
  asyncHandler(updateAjustesTenantController),
);

export default router;
