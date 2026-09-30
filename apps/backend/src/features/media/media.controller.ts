import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { getMediaStorage } from '../../integrations/storage/index.js';
import {
  reintentarIngesta,
  resolverMediaDescargable,
  resolverRangoBytes,
  verificarTokenMedia,
} from './media.service.js';
import type { GetMediaQuery } from './media.validation.js';

/**
 * Tipos que se pueden mostrar dentro del hilo. Todo lo demás se descarga.
 *
 * Los documentos van como `attachment` **por defecto y a propósito**: servir un archivo subido por
 * un tercero `inline` desde nuestro propio origen es la vía clásica de XSS almacenado. La lista
 * blanca de mimes ya excluye `svg` y `html`, y esto es la segunda barrera.
 */
const TIPOS_INLINE = new Set(['imagen', 'video', 'audio', 'sticker']);

/**
 * Sirve el archivo de un mensaje.
 *
 * **Sin `authenticateJWT`: la autorización de esta ruta es el HMAC de la URL.** Es la tercera
 * excepción documentada a "el `tenantId` nace del token" —junto al `login` y el webhook de Meta— y
 * la más benigna de las tres, porque aquí el tenant sí nace de un token firmado, solo que no del
 * JWT. El motivo está en `firmarUrlMedia`: la cookie de sesión no viaja en un `<img>` cross-site.
 *
 * El aislamiento sigue viviendo en `resolverMediaDescargable`, que resuelve con `findByIdScoped`.
 */
export const getMediaController: RequestHandler = async (req, res) => {
  const messageId = req.params['id'] as string;
  const { t, descargar } = req.validatedQuery as unknown as GetMediaQuery;

  const { tenantId } = verificarTokenMedia(t, messageId);

  const media = await resolverMediaDescargable(tenantId, messageId);
  const storage = getMediaStorage();

  // Se pregunta por la CAPACIDAD de firmar, no por el driver: con Spaces devuelve una URL y el
  // archivo no pasa por el droplet; con disco local devuelve `null` y lo servimos nosotros.
  const url = await storage.urlFirmada(media.mediaKey, env.MEDIA_SIGNED_URL_TTL_S);
  if (url) {
    res.redirect(302, url);
    return;
  }

  // `Range` (HU-OMNI-07): sin él, `<audio>` y `<video>` no pueden avanzar. Solo aplica si
  // conocemos el tamaño total; si no, se sirve completo (un `200` es una respuesta válida a un
  // `Range` que el servidor decide ignorar).
  const total = media.tamanoBytes ?? 0;
  const rango = resolverRangoBytes(req.headers.range, total);
  if (rango === null) {
    res.setHeader('Content-Range', `bytes */${total}`);
    res.status(416).end();
    return;
  }

  const { stream } = await storage.leer(media.mediaKey, rango);

  const inline = descargar !== '1' && TIPOS_INLINE.has(media.tipo);
  const nombre = media.nombreArchivo ?? `archivo-${messageId}`;

  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  if (rango) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${rango.inicio}-${rango.fin}/${total}`);
    res.setHeader('Content-Length', String(rango.fin - rango.inicio + 1));
  } else if (media.tamanoBytes) {
    res.setHeader('Content-Length', String(media.tamanoBytes));
  }
  // Sin `nosniff`, el navegador puede ignorar el Content-Type y ejecutar lo que "parezca" HTML.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // `private` no es cosmético: sin él un proxy compartido podría cachear la media de una empresa
  // y servírsela a otra.
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
  );

  stream.on('error', () => res.destroy());
  stream.pipe(res);
};

/**
 * Reintenta la descarga de un archivo que falló. `202`: el trabajo queda encolado, no hecho.
 */
export const retryMediaController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  await reintentarIngesta(tenantId, req.params['id'] as string);
  res.status(202).json({ estado: 'pendiente' });
};
