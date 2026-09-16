import { createHmac, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { findByIdScoped, findOneAndUpdateScoped } from '../../repositories/base.repository.js';
import { MEDIA_INGEST_JOB, mediaIngestQueue } from '../../config/queues.js';
import { mediaIngestJobId } from '../../workers/media-ingest.processor.js';
import { Message } from '../message/message.model.js';
import type {
  IMensajeMedia,
  IMessageDocument,
  IPreviewEnlace,
  TipoMensaje,
} from '../message/message.types.js';
import { LIMITES_MEDIA, esTipoConMedia } from './media.types.js';
import type {
  IMediaDescargable,
  IMediaResponse,
  IMediaTokenPayload,
  TipoMediaSaliente,
} from './media.types.js';
import { construirMediaKey, getMediaStorage } from '../../integrations/storage/index.js';
import { metaMediaClient } from '../../integrations/meta/meta-media.client.js';
import { getIntegrationWithToken } from '../channel/channel.service.js';
import { sendOutbound } from '../message/message.service.js';
import { logger } from '../../utils/logger.js';

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

/** Techo efectivo de un tipo: el menor entre el límite de Meta y el configurado. */
function maxBytesDe(tipo: TipoMediaSaliente): number {
  const porEnv = {
    imagen: env.MEDIA_MAX_BYTES_IMAGEN,
    video: env.MEDIA_MAX_BYTES_VIDEO,
    documento: env.MEDIA_MAX_BYTES_DOCUMENTO,
  }[tipo];
  return Math.min(LIMITES_MEDIA[tipo].maxBytes, porEnv);
}

/**
 * Clasifica un archivo por su mime y valida tipo y tamaño.
 *
 * El mime decide el tipo, no la extensión: la extensión la escribe quien sube el archivo y no se
 * puede confiar en ella. Un mime fuera de las listas se rechaza con 415 en vez de intentar enviarlo
 * y recibir un error opaco de Meta — y ahí es donde `svg` y `html` quedan fuera, que es lo que
 * impide que un archivo de un cliente se sirva como script desde nuestro propio origen.
 */
export function clasificarArchivoSaliente(
  mimeType: string,
  tamanoBytes: number,
): TipoMediaSaliente {
  const mime = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';

  const tipo = (Object.keys(LIMITES_MEDIA) as TipoMediaSaliente[]).find((t) =>
    LIMITES_MEDIA[t].mimes.includes(mime),
  );

  if (!tipo) {
    throw new AppError(`No se pueden enviar archivos de tipo ${mime || 'desconocido'}.`, 415);
  }

  const max = maxBytesDe(tipo);
  if (tamanoBytes > max) {
    const mb = Math.floor(max / (1024 * 1024));
    throw new AppError(`El archivo supera el tamaño permitido (${mb} MB).`, 413);
  }

  return tipo;
}

export interface IArchivoSaliente {
  buffer: Buffer;
  mimeType: string;
  nombreArchivo: string;
}

/**
 * Sube un archivo del asesor y lo envía por WhatsApp.
 *
 * **Orden: nuestro almacenamiento primero, Meta después.** Si Meta fuera primero y el guardado
 * fallara, el cliente ya habría recibido un archivo que nuestra propia bandeja no puede mostrar:
 * una inconsistencia visible e irreversible. Al revés, el peor caso es un objeto huérfano, y el
 * `catch` lo limpia.
 *
 * La ventana de 24 h no se decide aquí: la decide `sendOutbound`, como todo lo demás.
 */
export async function enviarMediaSaliente(
  tenantId: string,
  clienteId: string,
  archivo: IArchivoSaliente,
  caption: string | undefined,
): Promise<IMessageDocument> {
  const tipo = clasificarArchivoSaliente(archivo.mimeType, archivo.buffer.byteLength);

  const storage = getMediaStorage();
  // La clave se construye con el `clienteId` como carpeta intermedia porque el mensaje aún no
  // existe: se crea al final, dentro de `sendOutbound`.
  const key = construirMediaKey(tenantId, clienteId, archivo.mimeType);

  const guardado = await storage.guardar({
    key,
    contenido: archivo.buffer,
    mimeType: archivo.mimeType,
    nombreArchivo: archivo.nombreArchivo,
  });

  try {
    const integration = await getIntegrationWithToken(tenantId);
    const { mediaId } = await metaMediaClient.subir(
      integration.phoneNumberId,
      integration.accessToken,
      archivo,
    );

    return await sendOutbound(
      tenantId,
      clienteId,
      {
        modo: 'media',
        tipo,
        metaMediaId: mediaId,
        mediaKey: guardado.key,
        mimeType: guardado.mimeType,
        tamanoBytes: guardado.tamanoBytes,
        ...(archivo.nombreArchivo ? { nombreArchivo: archivo.nombreArchivo } : {}),
        ...(caption ? { caption } : {}),
      },
      'agent',
    );
  } catch (err: unknown) {
    // Limpieza best-effort: si no se pudo enviar, el objeto que acabamos de guardar no lo va a
    // referenciar ningún mensaje. Que el borrado falle no debe tapar el error real del envío.
    void storage.eliminar(guardado.key).catch((e: unknown) => {
      logger.warn('No se pudo limpiar la media huérfana', { key: guardado.key, error: String(e) });
    });
    throw err;
  }
}

/**
 * Reencola la descarga de una media que falló.
 *
 * Existe porque los fallos definitivos —Media ID caducado, Graph caído durante horas— dejan el
 * mensaje en `fallida` sin más reintentos automáticos, y un asesor que ve el aviso necesita poder
 * intentarlo una vez más sin pedirle nada al cliente.
 *
 * Vuelve a `pendiente` **antes** de encolar: si encolar falla, el estado ya refleja que hay algo en
 * curso, y el barrido de media atascada lo recoge.
 */
export async function reintentarIngesta(tenantId: string, messageId: string): Promise<void> {
  const msg = await findByIdScoped(Message, tenantId, messageId).lean();
  if (!msg) throw new AppError('Archivo no encontrado.', 404);

  if (!msg.media) throw new AppError('Este mensaje no tiene ningún archivo.', 409);
  if (msg.media.estado === 'disponible') return;
  if (!msg.media.metaMediaId) {
    throw new AppError('El mensaje no trae identificador de archivo: no se puede reintentar.', 409);
  }

  await findOneAndUpdateScoped(
    Message,
    tenantId,
    { _id: new Types.ObjectId(messageId) },
    { $set: { 'media.estado': 'pendiente', 'media.intentos': 0 }, $unset: { 'media.error': '' } },
  );

  await mediaIngestQueue.add(
    MEDIA_INGEST_JOB,
    { tenantId, messageId, clienteId: String(msg.clienteId) },
    {
      // Sufijo con la hora: el `jobId` del intento original puede seguir en Redis como completado o
      // fallido, y BullMQ trataría el reintento como duplicado y no haría nada.
      jobId: `${mediaIngestJobId(tenantId, messageId)}-r${Date.now()}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}
