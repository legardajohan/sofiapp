import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { subirImagenCampana } from '../../middlewares/upload.middleware.js';
import {
  campaignIdSchema,
  campaignMetricsSchema,
  campaignsOverviewSchema,
  createCampaignSchema,
  listCampaignsSchema,
  listRecipientsSchema,
  previewSegmentoSchema,
  rescheduleCampaignSchema,
  scheduleCampaignSchema,
  transicionSchema,
} from './campaign.validation.js';
import {
  cancelCampaignController,
  createCampaignController,
  getCampaignController,
  getCampaignMetricsController,
  getCampaignsOverviewController,
  launchCampaignController,
  listCampaignsController,
  listRecipientsController,
  pauseCampaignController,
  previewSegmentController,
  rescheduleCampaignController,
  resumeCampaignController,
  scheduleCampaignController,
} from './campaign.controller.js';

const router = Router();

// Una campaña gasta cupo del número y dinero de la empresa: es cosa de administración.
const campaignRoles = authorize(['admin']);

// ANTES de `/:id`: es una ruta literal, no un identificador. Mismo criterio que
// `/api/estados/orden` y `/api/flows/reminder`.
router.post(
  '/segmento/preview',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  validate(previewSegmentoSchema),
  asyncHandler(previewSegmentController),
);

// HU-MARK-03 — programar con fecha/hora e imagen. Multipart: `subirImagenCampana` va entre
// `authorize` y `validate` (la excepción documentada en `apps/backend/CLAUDE.md`), porque los
// campos de texto no existen en `req.body` hasta que multer consume el stream. Ruta literal: ANTES
// de `/:id`.
router.post(
  '/schedule',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  subirImagenCampana,
  validate(scheduleCampaignSchema),
  asyncHandler(scheduleCampaignController),
);

router.patch(
  '/:id/schedule',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  subirImagenCampana,
  validate(rescheduleCampaignSchema),
  asyncHandler(rescheduleCampaignController),
);

// HU-MARK-04 — resumen de métricas del período. Ruta literal: ANTES de `/:id`.
router.get(
  '/metrics',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  validate(campaignsOverviewSchema),
  asyncHandler(getCampaignsOverviewController),
);

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  validate(listCampaignsSchema),
  asyncHandler(listCampaignsController),
);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  validate(createCampaignSchema),
  asyncHandler(createCampaignController),
);

router.get(
  '/:id',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  validate(campaignIdSchema),
  asyncHandler(getCampaignController),
);

router.get(
  '/:id/metrics',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  validate(campaignMetricsSchema),
  asyncHandler(getCampaignMetricsController),
);

router.get(
  '/:id/destinatarios',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  validate(listRecipientsSchema),
  asyncHandler(listRecipientsController),
);

router.post(
  '/:id/launch',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  validate(transicionSchema),
  asyncHandler(launchCampaignController),
);

router.post(
  '/:id/pause',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  validate(transicionSchema),
  asyncHandler(pauseCampaignController),
);

router.post(
  '/:id/resume',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  validate(transicionSchema),
  asyncHandler(resumeCampaignController),
);

// No hay DELETE: una campaña es un hecho ocurrido (a esa gente se le escribió). Se cancela, que es
// lo que detiene lo que queda por enviar sin borrar lo que ya pasó.
router.post(
  '/:id/cancel',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  validate(transicionSchema),
  asyncHandler(cancelCampaignController),
);

export default router;
