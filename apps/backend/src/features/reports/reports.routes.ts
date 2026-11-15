import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { authorizeRolEmpresa, ROLES_REPORTES } from '../../middlewares/authorize-rol-empresa.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  advisorActivityQuerySchema,
  advisorReportQuerySchema,
  handoffRateQuerySchema,
  peakHoursQuerySchema,
  topProductsQuerySchema,
} from './reports.validation.js';
import {
  getAdvisorActivityController,
  getAdvisorReportController,
  getHandoffRateController,
  getPeakHoursController,
  getTopProductsController,
} from './reports.controller.js';

const router: ExpressRouter = Router();

// Ruta de TENANT (HU-REP-01). Solo el rol Administrador (ADR 0017; AUTH-05 suma al coordinador,
// acotado a su equipo).
router.get(
  '/by-advisor',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  authorizeRolEmpresa(ROLES_REPORTES),
  validate(advisorReportQuerySchema),
  asyncHandler(getAdvisorReportController),
);

// HU-REP-02: tasa de escalamiento IA → asesor. Mismo gate que el reporte por asesor (ADR 0011).
router.get(
  '/handoff-rate',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  authorizeRolEmpresa(ROLES_REPORTES),
  validate(handoffRateQuerySchema),
  asyncHandler(getHandoffRateController),
);

// HU-REP-03: productos más consultados. Mismo gate que los dos anteriores (ADR 0011).
router.get(
  '/top-products',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  authorizeRolEmpresa(ROLES_REPORTES),
  validate(topProductsQuerySchema),
  asyncHandler(getTopProductsController),
);

// HU-REP-04: horas pico de mensajería. Mismo gate que el resto de reportes (ADR 0011).
router.get(
  '/peak-hours',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  authorizeRolEmpresa(ROLES_REPORTES),
  validate(peakHoursQuerySchema),
  asyncHandler(getPeakHoursController),
);

// HU-REP-06: tiempo activo por día, semana o mes. Mismo gate que el reporte por asesor (ADR 0011).
router.get(
  '/advisor-activity',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  authorizeRolEmpresa(ROLES_REPORTES),
  validate(advisorActivityQuerySchema),
  asyncHandler(getAdvisorActivityController),
);

export default router;
