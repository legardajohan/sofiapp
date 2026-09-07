import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { createFlowSchema, getFlowSchema, listFlowsSchema, updateFlowSchema } from './flow.validation.js';
import { getReminderSchema, updateReminderSchema } from '../tenant/tenant.validation.js';
import {
  createFlowController,
  getFlowController,
  listFlowsController,
  updateFlowController,
  getReminderController,
  updateReminderController,
} from './flow.controller.js';

const router = Router();

// El constructor de flujos es una herramienta de configuración del negocio: solo admin.
const flowRoles = authorize(['admin']);

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  flowRoles,
  validate(listFlowsSchema),
  asyncHandler(listFlowsController),
);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  flowRoles,
  validate(createFlowSchema),
  asyncHandler(createFlowController),
);

// HU-FLOW-02 — recordatorio de inactividad. Rutas literales, DEBEN ir antes de `/:id`: Express
// matchea rutas por orden de registro y `/:id` capturaría `/reminder` como si fuera un `id`.
router.get(
  '/reminder',
  authenticateJWT,
  requireTenant,
  flowRoles,
  validate(getReminderSchema),
  asyncHandler(getReminderController),
);

router.put(
  '/reminder',
  authenticateJWT,
  requireTenant,
  flowRoles,
  validate(updateReminderSchema),
  asyncHandler(updateReminderController),
);

router.get(
  '/:id',
  authenticateJWT,
  requireTenant,
  flowRoles,
  validate(getFlowSchema),
  asyncHandler(getFlowController),
);

router.put(
  '/:id',
  authenticateJWT,
  requireTenant,
  flowRoles,
  validate(updateFlowSchema),
  asyncHandler(updateFlowController),
);

export default router;
