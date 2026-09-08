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
  listLeadsSchema,
  updateLeadSchema,
  updateLeadStageSchema,
} from './lead.validation.js';
import {
  createLeadController,
  deleteLeadController,
  getLeadController,
  historialEstadoController,
  listLeadsController,
  updateLeadController,
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

// Embudo (HU-PIPE-01). Van ANTES de las rutas `/:id` genericas por la misma higiene de orden que
// el listado: la ruta mas concreta primero. Si no, `/:id` capturaria `stage` como si fuera un id.
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
