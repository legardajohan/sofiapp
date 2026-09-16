import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { getPipelineSchema } from './pipeline.validation.js';
import { getPipelineController } from './pipeline.controller.js';

const router = Router();

// Mismos roles que el listado de leads: el embudo es otra vista de la misma cartera.
const pipelineRoles = authorize(['admin']);

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  pipelineRoles,
  validate(getPipelineSchema),
  asyncHandler(getPipelineController),
);

export default router;
