import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { authorizeSubrol, SUBROLES_REPORTES } from '../../middlewares/authorize-subrol.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { advisorReportQuerySchema, handoffRateQuerySchema } from './reports.validation.js';
import { getAdvisorReportController, getHandoffRateController } from './reports.controller.js';

const router: ExpressRouter = Router();

// Ruta de TENANT (HU-REP-01). El subrol restringe a Director/Gerente; un admin sin subrol conserva
// acceso (ADR 0011, mismo criterio que 0006).
router.get(
  '/by-advisor',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  authorizeSubrol(SUBROLES_REPORTES),
  validate(advisorReportQuerySchema),
  asyncHandler(getAdvisorReportController),
);

// HU-REP-02: tasa de escalamiento IA → asesor. Mismo gate que el reporte por asesor (ADR 0011).
router.get(
  '/handoff-rate',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  authorizeSubrol(SUBROLES_REPORTES),
  validate(handoffRateQuerySchema),
  asyncHandler(getHandoffRateController),
);

export default router;
