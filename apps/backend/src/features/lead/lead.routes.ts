import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  createLeadSchema,
  deleteLeadSchema,
  getLeadSchema,
  historialEstadoSchema,
  historialSemaforoSchema,
  listLeadsSchema,
  updateLeadSchema,
  updateLeadSemaforoSchema,
  updateLeadStageSchema,
} from './lead.validation.js';
import {
  createLeadController,
  deleteLeadController,
  getLeadController,
  historialEstadoController,
  historialSemaforoController,
  listLeadsController,
  updateLeadController,
  updateLeadSemaforoController,
  updateLeadStageController,
} from './lead.controller.js';

const router = Router();

// Mismos roles que la bandeja: el lead nace desde una conversación.
const leadRoles = authorize(['admin']);

// El listado va antes que `/:id` por higiene de orden: la ruta más concreta primero.
router.get(
  '/',
  authenticateJWT,
  requireTenant,
  leadRoles,
  validate(listLeadsSchema),
  asyncHandler(listLeadsController),
);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  leadRoles,
  validate(createLeadSchema),
  asyncHandler(createLeadController),
);

// Embudo (HU-PIPE-01) y semaforización (HU-CRM-04). Van ANTES de las rutas `/:id` genéricas por la
// misma higiene de orden que el listado: la ruta más concreta primero. Si no, `/:id` capturaría
// `stage` o `status` como si fueran un id.
router.patch(
  '/:id/stage',
  authenticateJWT,
  requireTenant,
  leadRoles,
  validate(updateLeadStageSchema),
  asyncHandler(updateLeadStageController),
);

router.get(
  '/:id/historial-etapa',
  authenticateJWT,
  requireTenant,
  leadRoles,
  validate(historialEstadoSchema),
  asyncHandler(historialEstadoController),
);

router.patch(
  '/:id/status',
  authenticateJWT,
  requireTenant,
  leadRoles,
  validate(updateLeadSemaforoSchema),
  asyncHandler(updateLeadSemaforoController),
);

router.get(
  '/:id/historial',
  authenticateJWT,
  requireTenant,
  leadRoles,
  validate(historialSemaforoSchema),
  asyncHandler(historialSemaforoController),
);

router.get(
  '/:id',
  authenticateJWT,
  requireTenant,
  leadRoles,
  validate(getLeadSchema),
  asyncHandler(getLeadController),
);

router.patch(
  '/:id',
  authenticateJWT,
  requireTenant,
  leadRoles,
  validate(updateLeadSchema),
  asyncHandler(updateLeadController),
);

router.delete(
  '/:id',
  authenticateJWT,
  requireTenant,
  leadRoles,
  validate(deleteLeadSchema),
  asyncHandler(deleteLeadController),
);

export default router;
