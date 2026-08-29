import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { createEstadoSchema } from './estado.validation.js';
import { createEstadoController, listEstadosController } from './estado.controller.js';

const router = Router();

// Mismos roles que el listado de leads: el catálogo es la vista del pipeline de la empresa.
const estadoRoles = authorize(['admin']);

router.get('/', authenticateJWT, requireTenant, estadoRoles, asyncHandler(listEstadosController));

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  estadoRoles,
  validate(createEstadoSchema),
  asyncHandler(createEstadoController),
);

export default router;
