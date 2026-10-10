import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { subirImagenCabecera, subirImagenCampana } from '../../middlewares/upload.middleware.js';
import {
  campaignIdSchema,
  createCampaignSchema,
  listCampaignsSchema,
  listRecipientsSchema,
  previewSegmentoSchema,
  rescheduleCampaignSchema,
  scheduleCampaignSchema,
  transicionSchema,
  uploadCampaignMediaSchema,
} from './campaign.validation.js';
import {
  cancelCampaignController,
  createCampaignController,
  getCampaignController,
  launchCampaignController,
  listCampaignsController,
  listRecipientsController,
  pauseCampaignController,
  previewSegmentController,
  rescheduleCampaignController,
  resumeCampaignController,
  scheduleCampaignController,
  uploadCampaignMediaController,
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

// HT-WA-04 — imagen de reemplazo en dos pasos: responde un `uploadId` que consume `POST /campaigns`
// o `POST /messages/template`. Multipart, ruta literal: ANTES de `/:id`.
router.post(
  '/media',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  subirImagenCabecera,
  validate(uploadCampaignMediaSchema),
  asyncHandler(uploadCampaignMediaController),
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
