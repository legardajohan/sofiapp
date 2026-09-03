import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { createFlowSchema, getFlowSchema, listFlowsSchema, updateFlowSchema } from './flow.validation.js';
import {
  createFlowController,
  getFlowController,
  listFlowsController,
  updateFlowController,
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
