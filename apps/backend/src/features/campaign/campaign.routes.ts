import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import {
  authorizeRolEmpresa,
  ROLES_CONFIGURACION,
} from '../../middlewares/authorize-rol-empresa.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { subirImagenCabecera, subirImagenCampana } from '../../middlewares/upload.middleware.js';
import {
  audienciaSegmentoSchema,
  campaignIdSchema,
  campaignMetricsSchema,
  campaignsOverviewSchema,
  createCampaignSchema,
  listCampaignsSchema,
  listRecipientsSchema,
  previewAudienciaSchema,
  previewSegmentoSchema,
  sendCampaignSchema,
  segmentoFacetasSchema,
  rescheduleCampaignSchema,
  scheduleCampaignSchema,
  transicionSchema,
  uploadCampaignMediaSchema,
} from './campaign.validation.js';
import {
  cancelCampaignController,
  createCampaignController,
  getCampaignController,
  getCampaignMetricsController,
  getCampaignsOverviewController,
  getSegmentFacetasController,
  launchCampaignController,
  listCampaignsController,
  listRecipientsController,
  listSegmentAudienceController,
  pauseCampaignController,
  previewAudienceController,
  previewSegmentController,
  sendCampaignController,
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
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(previewSegmentoSchema),
  asyncHandler(previewSegmentController),
);

// HU-MARK-07 — audiencia por mensajes recientes. Literal: ANTES de `/:id`.
router.post(
  '/audience/preview',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(previewAudienciaSchema),
  asyncHandler(previewAudienceController),
);

// HT-WA-04 — imagen de reemplazo en dos pasos: responde un `uploadId` que consume `POST /campaigns`
// o `POST /messages/template`. Multipart, ruta literal: ANTES de `/:id`.
router.post(
  '/media',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  subirImagenCabecera,
  validate(uploadCampaignMediaSchema),
  asyncHandler(uploadCampaignMediaController),
);

// Constructor de audiencias: contactos alcanzables por etapa y etiqueta, y la audiencia paginada
// con búsqueda. Rutas literales, ANTES de `/:id` como la vista previa.
router.get(
  '/segmento/facetas',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(segmentoFacetasSchema),
  asyncHandler(getSegmentFacetasController),
);

router.post(
  '/segmento/contactos',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(audienciaSegmentoSchema),
  asyncHandler(listSegmentAudienceController),
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
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  subirImagenCampana,
  validate(scheduleCampaignSchema),
  asyncHandler(scheduleCampaignController),
);

router.patch(
  '/:id/schedule',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
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
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(campaignsOverviewSchema),
  asyncHandler(getCampaignsOverviewController),
);

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(listCampaignsSchema),
  asyncHandler(listCampaignsController),
);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(createCampaignSchema),
  asyncHandler(createCampaignController),
);

router.get(
  '/:id',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(campaignIdSchema),
  asyncHandler(getCampaignController),
);

router.get(
  '/:id/metrics',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(campaignMetricsSchema),
  asyncHandler(getCampaignMetricsController),
);

router.get(
  '/:id/destinatarios',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(listRecipientsSchema),
  asyncHandler(listRecipientsController),
);

router.post(
  '/:id/launch',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(transicionSchema),
  asyncHandler(launchCampaignController),
);

// HU-MARK-07 — lanzar con etiqueta para los destinatarios enviados con éxito.
router.post(
  '/:id/send',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(sendCampaignSchema),
  asyncHandler(sendCampaignController),
);

router.post(
  '/:id/pause',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(transicionSchema),
  asyncHandler(pauseCampaignController),
);

router.post(
  '/:id/resume',
  authenticateJWT,
  requireTenant,
  campaignRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
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
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(transicionSchema),
  asyncHandler(cancelCampaignController),
);

export default router;
