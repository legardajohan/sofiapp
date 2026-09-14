import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  createEstadoSchema,
  deleteEstadoSchema,
  listEstadosSchema,
  reorderEstadosSchema,
  updateEstadoSchema,
} from './estado.validation.js';
import {
  createEstadoController,
  deleteEstadoController,
  listEstadosController,
  reorderEstadosController,
  updateEstadoController,
} from './estado.controller.js';

const router = Router();

// Mismos roles que el listado de leads: el catálogo es la vista del pipeline de la empresa.
const estadoRoles = authorize(['admin']);

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  estadoRoles,
  validate(listEstadosSchema),
  asyncHandler(listEstadosController),
);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  estadoRoles,
  validate(createEstadoSchema),
  asyncHandler(createEstadoController),
);

// ANTES de `/:id`, y no es cosmético: Express casa por orden de registro, así que con `/:id`
// primero un `PATCH /api/estados/orden` entraría por ahí con `id: 'orden'` y moriría en el
// validador de ObjectId con un 400 que no explica nada.
router.patch(
  '/orden',
  authenticateJWT,
  requireTenant,
  estadoRoles,
  validate(reorderEstadosSchema),
  asyncHandler(reorderEstadosController),
);

router.patch(
  '/:id',
  authenticateJWT,
  requireTenant,
  estadoRoles,
  validate(updateEstadoSchema),
  asyncHandler(updateEstadoController),
);

router.delete(
  '/:id',
  authenticateJWT,
  requireTenant,
  estadoRoles,
  validate(deleteEstadoSchema),
  asyncHandler(deleteEstadoController),
);

export default router;
