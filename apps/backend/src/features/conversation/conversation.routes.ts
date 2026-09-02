import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import {
  authorizeSubrol,
  SUBROLES_DATOS_SENSIBLES,
} from '../../middlewares/authorize-subrol.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  aplicarSemaforoSchema,
  assignSchema,
  assignmentsSchema,
  classificationsSchema,
  iaSchema,
  listConversationsSchema,
  overviewSchema,
  readSchema,
  replySchema,
  summarySchema,
  tagsSchema,
  threadSchema,
} from './conversation.validation.js';
import {
  aplicarSemaforoController,
  assignController,
  generateSummaryController,
  getOverviewController,
  getThreadController,
  listAssignmentsController,
  listClassificationsController,
  listConversationsController,
  markReadController,
  replyController,
  setIaController,
  setTagsController,
} from './conversation.controller.js';

const router = Router();

const bandejaRoles = authorize(['admin']);

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(listConversationsSchema),
  asyncHandler(listConversationsController),
);

/**
 * Vista unificada: cabecera, etiquetas, resumen y permisos (HU-IA-04).
 *
 * **Sin `authorizeSubrol` a propósito.** La vista es para todos los admin y lo que cambia es su
 * contenido: cerrar la ruta entera dejaría a `coordinator` y `secretary` sin cabecera ni etiquetas,
 * que sí les corresponden. El gate del resumen va por campo, dentro del service — la misma
 * distinción de granularidad que ADR-0006 §3 establece entre las notas y los campos del contacto.
 */
router.get(
  '/:id/overview',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(overviewSchema),
  asyncHandler(getOverviewController),
);

router.get(
  '/:id/messages',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(threadSchema),
  asyncHandler(getThreadController),
);

router.post(
  '/:id/messages',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(replySchema),
  asyncHandler(replyController),
);

router.patch(
  '/:id/read',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(readSchema),
  asyncHandler(markReadController),
);

router.patch(
  '/:id/ia',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(iaSchema),
  asyncHandler(setIaController),
);

// Aquí SÍ se cierra la ruta entera: no hay respuesta parcial que devolver, y cada llamada paga
// entre 7 y 26 s de modelo. Quien no puede leer el resumen tampoco puede pagarlo (HU-IA-04).
router.post(
  '/:id/summary',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  authorizeSubrol(SUBROLES_DATOS_SENSIBLES),
  validate(summarySchema),
  asyncHandler(generateSummaryController),
);

router.patch(
  '/:id/tags',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(tagsSchema),
  asyncHandler(setTagsController),
);

router.patch(
  '/:id/assign',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(assignSchema),
  asyncHandler(assignController),
);

router.get(
  '/:id/assignments',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(assignmentsSchema),
  asyncHandler(listAssignmentsController),
);

router.post(
  '/:id/semaforo',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(aplicarSemaforoSchema),
  asyncHandler(aplicarSemaforoController),
);

router.get(
  '/:id/classifications',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(classificationsSchema),
  asyncHandler(listClassificationsController),
);

export default router;
