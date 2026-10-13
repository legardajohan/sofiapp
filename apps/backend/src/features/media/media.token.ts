import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import type { IMediaTokenPayload } from './media.types.js';

/**
 * Firma el acceso a la media de un mensaje.
 *
 * **Por qué un token en la URL y no la cookie de sesión.** El JWT viaja en una cookie `httpOnly`,
 * pero en producción el frontend está en Vercel y el API en el droplet: un `<img src="https://api…">`
 * es una subpetición **cross-site** y con `SameSite=lax` la cookie no se envía. Todas las imágenes
 * darían 401, y solo en producción. El HMAC en la URL funciona en cualquier despliegue y es,
 * literalmente, la "URL firmada de acceso" que pide la historia.
 *
 * El `tenantId` va dentro del material firmado, así que no se puede cambiar sin invalidar la firma:
 * es lo que permite que la ruta resuelva el tenant sin `authenticateJWT`. Aun así **el aislamiento
 * no lo da el token**, lo da el `findByIdScoped` de `resolverMediaDescargable`.
 */
export function firmarUrlMedia(tenantId: string, messageId: string): string {
  const exp = Math.floor(Date.now() / 1000) + env.MEDIA_URL_TTL_S;
  const firma = calcularFirma(tenantId, messageId, exp);
  return `${tenantId}.${exp}.${firma}`;
}

function calcularFirma(tenantId: string, messageId: string, exp: number): string {
  return createHmac('sha256', env.MEDIA_URL_SECRET as string)
    .update(`${tenantId}.${messageId}.${exp}`)
    .digest('hex');
}

/**
 * Verifica un token de media contra el `messageId` que se está pidiendo. Lanza `403` si no cuadra.
 *
 * El `messageId` entra como argumento y no viene del token a propósito: un token firmado para un
 * mensaje no puede servir para pedir otro, ni siquiera del mismo tenant.
 */
export function verificarTokenMedia(token: string, messageId: string): IMediaTokenPayload {
  const partes = token.split('.');
  if (partes.length !== 3) throw new AppError('Enlace de archivo inválido.', 403);

  const [tenantId, expRaw, firma] = partes as [string, string, string];
  const exp = Number(expRaw);
  if (!Number.isInteger(exp)) throw new AppError('Enlace de archivo inválido.', 403);

  if (exp * 1000 < Date.now()) throw new AppError('El enlace del archivo expiró.', 403);

  const esperada = calcularFirma(tenantId, messageId, exp);
  const a = Buffer.from(firma, 'hex');
  const b = Buffer.from(esperada, 'hex');

  // `timingSafeEqual` exige longitudes iguales y lanza si no lo son, así que se comprueba antes.
  // La comparación constante evita que el tiempo de respuesta filtre cuántos bytes del HMAC acertó
  // quien esté probando firmas.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError('Enlace de archivo inválido.', 403);
  }

  return { tenantId, messageId, exp };
}

/**
 * Recurso firmable de la imagen de una campaña (HU-MARK-03). Prefijo distinto al id de un mensaje
 * para que un token de campaña no sirva nunca como token de mensaje, aunque coincidan los ids.
 */
export function recursoImagenCampana(campaignId: string): string {
  return `campaign-${campaignId}`;
}

/**
 * Recurso firmable de la imagen por defecto de una plantilla (HT-WA-04). Prefijo propio por la misma
 * razón que `recursoImagenCampana`: un token de plantilla no sirve como token de campaña o mensaje.
 */
export function recursoImagenPlantilla(templateId: string): string {
  return `template-${templateId}`;
}
