import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { getMediaController, retryMediaController } from './media.controller.js';
import { getMediaSchema, retryMediaSchema } from './media.validation.js';

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
