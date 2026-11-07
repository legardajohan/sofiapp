import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import {
  SUBROLES_DATOS_SENSIBLES,
  authorizeSubrol,
} from '../../middlewares/authorize-subrol.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  listPendientesSchema,
  pdfPendientesSchema,
  transicionPendienteSchema,
} from './pendiente.validation.js';
import {
  cerrarPendienteController,
  listPendientesController,
  pdfPendientesController,
  reabrirPendienteController,
} from './pendiente.controller.js';

const router = Router();

// RN8: un pendiente ES una nota, así que se ve con el mismo gate que las notas (ADR 0006). Quien no
// puede leer las notas de un contacto tampoco puede verlas reunidas en el embudo ni en un PDF.
const pendientesRoles = [authorize(['admin']), authorizeSubrol(SUBROLES_DATOS_SENSIBLES)];

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  ...pendientesRoles,
  validate(listPendientesSchema),
  asyncHandler(listPendientesController),
);

router.get(
  '/pdf',
  authenticateJWT,
  requireTenant,
  ...pendientesRoles,
  validate(pdfPendientesSchema),
  asyncHandler(pdfPendientesController),
);

// HU-PDF-01 A1: cerrar (archivar en el historial) y reabrir. POST porque son transiciones, no
// ediciones de campos; mismo gate que leerlos.
router.post(
  '/:id/cerrar',
  authenticateJWT,
  requireTenant,
  ...pendientesRoles,
  validate(transicionPendienteSchema),
  asyncHandler(cerrarPendienteController),
);

router.post(
  '/:id/reabrir',
  authenticateJWT,
  requireTenant,
  ...pendientesRoles,
  validate(transicionPendienteSchema),
  asyncHandler(reabrirPendienteController),
);

export default router;
