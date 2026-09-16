import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { findByIdScoped } from '../../repositories/base.repository.js';
import { Message } from '../message/message.model.js';
import type { IMensajeMedia, IPreviewEnlace, TipoMensaje } from '../message/message.types.js';
import { esTipoConMedia } from './media.types.js';
import type { IMediaDescargable, IMediaResponse, IMediaTokenPayload } from './media.types.js';

type TenantId = string | Types.ObjectId;

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
 * Resuelve el archivo de un mensaje **dentro del tenant**. Aquí está el aislamiento del feature.
 *
 * Un `messageId` de otra empresa devuelve el **mismo 404** que uno inexistente: sin esa simetría, la
 * diferencia entre los dos códigos sería un oráculo para averiguar qué ids existen en otros tenants.
 */
export async function resolverMediaDescargable(
  tenantId: TenantId,
  messageId: string,
): Promise<IMediaDescargable> {
  const msg = await findByIdScoped(Message, tenantId, messageId).lean();
  if (!msg) throw new AppError('Archivo no encontrado.', 404);

  const media = msg.media;
  if (!media || media.estado !== 'disponible' || !media.mediaKey) {
    throw new AppError('El archivo aún no está disponible.', 409);
  }

  return {
    mediaKey: media.mediaKey,
    mimeType: media.mimeType,
    nombreArchivo: media.nombreArchivo ?? null,
    tamanoBytes: media.tamanoBytes ?? null,
    tipo: msg.tipo,
  };
}

/** Proyecta `Message.media` al DTO, firmando la URL solo cuando hay algo que servir. */
export function toMediaResponse(
  tenantId: string,
  messageId: string,
  media: IMensajeMedia | undefined,
): IMediaResponse | null {
  if (!media) return null;

  return {
    estado: media.estado,
    mimeType: media.mimeType,
    nombreArchivo: media.nombreArchivo ?? null,
    tamanoBytes: media.tamanoBytes ?? null,
    urlArchivo:
      media.estado === 'disponible'
        ? `/media/${messageId}?t=${firmarUrlMedia(tenantId, messageId)}`
        : null,
    error: media.error ?? null,
  };
}

/**
 * Primera URL de un texto. Deliberadamente conservador: exige `http(s)://` explícito en vez de
 * adivinar dominios sueltos, porque "vale 3.5 millones" no es un enlace y marcarlo como tal
 * cambiaría el tipo del mensaje por un falso positivo.
 */
const RE_URL = /https?:\/\/[^\s<>"']+/i;

export function extraerPrimeraUrl(texto: string | undefined): string | null {
  const m = texto?.match(RE_URL);
  return m?.[0] ?? null;
}

function dominioDe(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Clasifica un mensaje de texto: `enlace` si contiene una URL, `texto` si no.
 *
 * Se llama al persistir, no al leer, para que el hilo no tenga que re-analizar el histórico en cada
 * consulta. El `texto` se conserva íntegro en ambos casos: `enlace` **no** sustituye al texto, lo
 * acompaña — de ahí que esté en `TIPOS_CON_TEXTO`.
 */
export function clasificarTexto(texto: string | undefined): {
  tipo: TipoMensaje;
  previewEnlace?: IPreviewEnlace;
} {
  const url = extraerPrimeraUrl(texto);
  if (!url) return { tipo: 'texto' };

  const dominio = dominioDe(url);
  if (!dominio) return { tipo: 'texto' };

  return { tipo: 'enlace', previewEnlace: { url, dominio } };
}

export { esTipoConMedia };
