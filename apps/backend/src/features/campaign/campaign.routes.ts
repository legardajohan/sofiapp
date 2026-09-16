import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  campaignIdSchema,
  createCampaignSchema,
  listCampaignsSchema,
  listRecipientsSchema,
  previewSegmentoSchema,
  transicionSchema,
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
  resumeCampaignController,
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
