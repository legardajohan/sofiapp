import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { listPlansSchema, createPlanSchema, updatePlanSchema } from './plan.validation.js';
import {
  listPlansController,
  createPlanController,
  updatePlanController,
} from './plan.controller.js';

const router: ExpressRouter = Router();

// Catálogo GLOBAL de planes (superadmin, cross-tenant): SIN requireTenant.
// Cadena: authenticateJWT → authorize(['superadmin']) → validate → asyncHandler

router.get(
  '/',
  authenticateJWT,
  authorize(['superadmin']),
  validate(listPlansSchema),
  asyncHandler(listPlansController),
);

router.post(
  '/',
  authenticateJWT,
  authorize(['superadmin']),
  validate(createPlanSchema),
  asyncHandler(createPlanController),
);

router.patch(
  '/:id',
  authenticateJWT,
  authorize(['superadmin']),
  validate(updatePlanSchema),
  asyncHandler(updatePlanController),
);

export default router;
