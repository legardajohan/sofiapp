import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { createSemaforoSchema, updateSemaforoSchema } from './semaforo.validation.js';
import {
  createSemaforoController,
  listSemaforosController,
  updateSemaforoController,
} from './semaforo.controller.js';

const router = Router();

// Mismos roles que el listado de leads: el catálogo es la vista comercial de la empresa.
const semaforoRoles = authorize(['admin']);

router.get('/', authenticateJWT, requireTenant, semaforoRoles, asyncHandler(listSemaforosController));

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  semaforoRoles,
  validate(createSemaforoSchema),
  asyncHandler(createSemaforoController),
);

// No hay DELETE a propósito: los leads llevan la `key` grabada y borrarla dejaría filas mostrando
// una clave cruda. Se archiva con `{ activo: false }`.
router.patch(
  '/:id',
  authenticateJWT,
  requireTenant,
  semaforoRoles,
  validate(updateSemaforoSchema),
  asyncHandler(updateSemaforoController),
);

export default router;
