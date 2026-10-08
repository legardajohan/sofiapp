import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { globalMetricsQuerySchema } from './admin-metrics.validation.js';
import { getGlobalMetricsController } from './admin-metrics.controller.js';

const router: ExpressRouter = Router();

// Rutas de Superadmin: authenticateJWT → authorize(['superadmin']) → validate → asyncHandler
// SIN requireTenant (superadmin no pertenece a ningún tenant) — docs/multi-tenancy.md §5.3 / §6

router.get(
  '/global',
  authenticateJWT,
  authorize(['superadmin']),
  validate(globalMetricsQuerySchema),
  asyncHandler(getGlobalMetricsController)
);

export default router;
