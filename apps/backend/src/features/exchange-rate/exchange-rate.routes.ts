import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { manualRateSchema } from './exchange-rate.validation.js';
import {
  getVigenteController,
  refreshController,
  registerManualController,
  revertController,
  historialController,
} from './exchange-rate.controller.js';

const router: ExpressRouter = Router();

// Tasa de cambio USD/COP (GLOBAL, superadmin, cross-tenant): SIN requireTenant.
// Cadena: authenticateJWT → authorize(['superadmin']) → validate → asyncHandler

router.get('/vigente', authenticateJWT, authorize(['superadmin']), asyncHandler(getVigenteController));

router.post('/refresh', authenticateJWT, authorize(['superadmin']), asyncHandler(refreshController));

router.post(
  '/manual',
  authenticateJWT,
  authorize(['superadmin']),
  validate(manualRateSchema),
  asyncHandler(registerManualController),
);

router.post('/revertir', authenticateJWT, authorize(['superadmin']), asyncHandler(revertController));

router.get(
  '/historial',
  authenticateJWT,
  authorize(['superadmin']),
  asyncHandler(historialController),
);

export default router;
