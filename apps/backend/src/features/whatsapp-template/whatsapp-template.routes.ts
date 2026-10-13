import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { subirImagenCabecera } from '../../middlewares/upload.middleware.js';
import {
  createTemplateSchema,
  listTemplatesSchema,
  syncTemplatesSchema,
  templateIdSchema,
  uploadTemplateMediaSchema,
} from './whatsapp-template.validation.js';
import {
  createTemplateController,
  getTemplateController,
  listTemplatesController,
  syncTemplateController,
  syncTemplatesController,
  uploadTemplateMediaController,
} from './whatsapp-template.controller.js';

const router: ExpressRouter = Router();

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(listTemplatesSchema),
  asyncHandler(listTemplatesController),
);

router.post(
  '/sync',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(syncTemplatesSchema),
  asyncHandler(syncTemplatesController),
);

// HT-WA-04 — imagen de muestra de la cabecera. Multipart: `subirImagenCabecera` va entre
// `authorize` y `validate` (excepción documentada en `apps/backend/CLAUDE.md`).
router.post(
  '/media',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  subirImagenCabecera,
  validate(uploadTemplateMediaSchema),
  asyncHandler(uploadTemplateMediaController),
);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(createTemplateSchema),
  asyncHandler(createTemplateController),
);

router.get(
  '/:id',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(templateIdSchema),
  asyncHandler(getTemplateController),
);

router.post(
  '/:id/sync',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(templateIdSchema),
  asyncHandler(syncTemplateController),
);

export default router;
