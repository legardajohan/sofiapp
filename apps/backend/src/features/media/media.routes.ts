import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  getCampaignImageController,
  getMediaController,
  getTemplateImageController,
  retryMediaController,
} from './media.controller.js';
import { getCampaignImageSchema, getMediaSchema, retryMediaSchema } from './media.validation.js';

const router = Router();

/**
 * Archivo de un mensaje. **Ruta pública en el sentido de que no lleva `authenticateJWT`**: su
 * credencial es el token HMAC del query (`?t=`), que el DTO del hilo genera y el navegador reenvía
 * en el `src` de un `<img>` o un `<video>`.
 *
 * No se puede resolver con la cookie de sesión: en producción el frontend está en Vercel y el API
 * en el droplet, así que la petición de una imagen es cross-site y `SameSite=lax` no manda la
 * cookie. Ver `media.service.firmarUrlMedia`.
 *
 * `csrfGuard` deja pasar los métodos seguros, así que un `GET` no necesita nada más.
 */
router.get('/:id', validate(getMediaSchema), asyncHandler(getMediaController));

/**
 * Imagen de cabecera de una campaña (HU-MARK-03), para la vista previa del programador y del
 * detalle. Misma excepción que la ruta de arriba: la credencial es el HMAC del query, firmado sobre
 * `campaign-<id>` — un token de mensaje no sirve aquí ni al revés.
 */
router.get(
  '/campaigns/:id/imagen',
  validate(getCampaignImageSchema),
  asyncHandler(getCampaignImageController),
);

/** Imagen por defecto de una plantilla (HT-WA-04). Credencial: HMAC firmado sobre `template-<id>`. */
router.get(
  '/templates/:id/imagen',
  validate(getCampaignImageSchema),
  asyncHandler(getTemplateImageController),
);

/**
 * Reintento manual de una descarga fallida. Esta SÍ es una acción del asesor, así que lleva la
 * cadena completa: no basta con tener el enlace del archivo para relanzar trabajo en la cola.
 */
router.post(
  '/:id/reintentar',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(retryMediaSchema),
  asyncHandler(retryMediaController),
);

export default router;
