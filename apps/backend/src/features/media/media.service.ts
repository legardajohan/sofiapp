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
import {
  LIMITES_MEDIA,
  MIME_NOTA_DE_VOZ,
  TIPOS_ADJUNTABLES,
  esTipoConMedia,
} from './media.types.js';
import type {
  IConfigAudioResponse,
  IMediaDescargable,
  IMediaResponse,
  IMediaTokenPayload,
  TipoMediaSaliente,
} from './media.types.js';
import {
  construirMediaKey,
  getMediaStorage,
  type IRangoBytes,
} from '../../integrations/storage/index.js';
import { metaMediaClient } from '../../integrations/meta/meta-media.client.js';
import { getIntegrationWithToken } from '../channel/channel.service.js';
import { getNotasDeVozConfig } from '../tenant/tenant.service.js';
import { Cliente } from '../cliente/cliente.model.js';
import { getTranscodificador } from '../../integrations/audio/index.js';
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

/**
 * Interpreta la cabecera `Range` de una petición de media (HU-OMNI-07).
 *
 * - `undefined`: sin cabecera, o con una forma que no soportamos (varios rangos, otra unidad). Se
 *   sirve el archivo completo con `200`, que es lo que la RFC 9110 permite hacer con un `Range` que
 *   el servidor decide ignorar.
 * - `null`: el rango es **insatisfacible** (empieza después del final) → `416`.
 *
 * Solo `bytes=a-b`, `bytes=a-` y `bytes=-n` (sufijo): es todo lo que piden `<audio>` y `<video>`.
 */
export function resolverRangoBytes(
  cabecera: string | undefined,
  tamanoBytes: number,
): IRangoBytes | null | undefined {
  if (!cabecera || tamanoBytes <= 0) return undefined;

  const m = /^bytes=(\d*)-(\d*)$/.exec(cabecera.trim());
  if (!m) return undefined;

  const [, desdeRaw = '', hastaRaw = ''] = m;
  if (desdeRaw === '' && hastaRaw === '') return undefined;

  const ultimo = tamanoBytes - 1;

  if (desdeRaw === '') {
    // Sufijo: los últimos N bytes.
    const n = Number(hastaRaw);
    if (n === 0) return null;
    return { inicio: Math.max(0, tamanoBytes - n), fin: ultimo };
  }

  const inicio = Number(desdeRaw);
  if (inicio > ultimo) return null;
  const fin = hastaRaw === '' ? ultimo : Math.min(Number(hastaRaw), ultimo);
  if (fin < inicio) return undefined;

  return { inicio, fin };
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
    duracionSegundos: media.duracionSegundos ?? null,
    esNotaDeVoz: media.esNotaDeVoz === true,
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
    audio: env.MEDIA_MAX_BYTES_AUDIO,
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
  permitidos: readonly TipoMediaSaliente[] = TIPOS_ADJUNTABLES,
): TipoMediaSaliente {
  const mime = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';

  // `permitidos` separa los dos caminos de subida: el menú de adjuntar no acepta audio (no pasaría
  // por la transcodificación) y el de notas de voz solo acepta audio.
  const tipo = permitidos.find((t) => LIMITES_MEDIA[t].mimes.includes(mime));

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
    //
    // Envuelto en `Promise.resolve().then(...)` y no `storage.eliminar(...).catch(...)` a
    // propósito: así también se captura un adaptador que lance de forma SÍNCRONA o que no devuelva
    // una promesa. Con el `.catch` directo, ese caso reventaba aquí mismo con un `TypeError` y el
    // asesor recibía un 500 en lugar del 404 o el 422 que de verdad había ocurrido — exactamente
    // lo que este comentario dice que no debe pasar.
    void Promise.resolve()
      .then(() => storage.eliminar(guardado.key))
      .catch((e: unknown) => {
        logger.warn('No se pudo limpiar la media huérfana', { key: guardado.key, error: String(e) });
      });
    throw err;
  }
}

/**
 * Límite efectivo de las notas de voz del tenant (HU-OMNI-07): el suyo, pero nunca por encima del
 * de Meta ni del configurado en el despliegue. Lo consumen el endpoint de configuración —para que
 * el navegador corte la grabación— y `enviarNotaDeVoz`, que lo vuelve a aplicar en el servidor.
 */
export async function obtenerConfigAudio(tenantId: string): Promise<IConfigAudioResponse> {
  const config = await getNotasDeVozConfig(tenantId);
  return {
    maxDuracionSegundos: config.maxDuracionSegundos,
    maxBytes: Math.min(config.maxBytes, maxBytesDe('audio')),
  };
}

function tamanoLegible(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Math.floor(mb)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function duracionLegible(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  if (m === 0) return `${s} s`;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/**
 * Transcodifica una nota de voz grabada en el navegador y la envía por WhatsApp (HU-OMNI-07).
 *
 * Espejo de `enviarMediaSaliente`, con dos pasos propios antes de guardar:
 *
 * 1. **El cliente se resuelve dentro del tenant ANTES de tocar ffmpeg.** `sendOutbound` también lo
 *    comprueba, pero al final: sin este corte, un id de otro tenant consumiría CPU transcodificando
 *    y solo después devolvería 404. Es la misma respuesta que un id inexistente.
 * 2. **La duración que vale es la medida**, no la que declara el navegador (`duracionPista`, que
 *    solo sirve para el log). El límite del tenant se aplica sobre ella.
 *
 * La ventana de 24 h sigue sin decidirse aquí: la decide `sendOutbound`. Comprobarla antes de
 * transcodificar ahorraría CPU fuera de ventana, pero sería una segunda implementación de la regla;
 * el frontend ya deshabilita el micrófono con la ventana cerrada.
 */
export async function enviarNotaDeVoz(
  tenantId: string,
  clienteId: string,
  grabacion: IArchivoSaliente,
  duracionPista?: number,
): Promise<IMessageDocument> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).select('_id').lean();
  if (!cliente) throw new AppError('Cliente no encontrado.', 404);

  clasificarArchivoSaliente(grabacion.mimeType, grabacion.buffer.byteLength, ['audio']);

  const limite = await obtenerConfigAudio(tenantId);
  if (grabacion.buffer.byteLength > limite.maxBytes) {
    throw new AppError(
      `La nota de voz supera el tamaño permitido (${tamanoLegible(limite.maxBytes)}).`,
      413,
    );
  }

  const audio = await getTranscodificador().aNotaDeVoz(grabacion.buffer);

  // `+ 1`: MediaRecorder corta en el segundo exacto, pero el contenedor puede sumar unas décimas de
  // relleno. Rechazar por eso una grabación que el propio navegador cortó a tiempo sería absurdo.
  if (audio.duracionSegundos > limite.maxDuracionSegundos + 1) {
    throw new AppError(
      `La nota de voz dura más de lo permitido (${duracionLegible(limite.maxDuracionSegundos)}).`,
      422,
    );
  }

  if (duracionPista !== undefined && Math.abs(duracionPista - audio.duracionSegundos) > 2) {
    logger.info('La duración declarada y la medida de la nota de voz difieren', {
      duracionPista,
      duracionMedida: audio.duracionSegundos,
    });
  }

  const storage = getMediaStorage();
  const key = construirMediaKey(tenantId, clienteId, MIME_NOTA_DE_VOZ);
  const nombreArchivo = 'nota-de-voz.ogg';

  const guardado = await storage.guardar({
    key,
    contenido: audio.buffer,
    mimeType: MIME_NOTA_DE_VOZ,
    nombreArchivo,
  });

  try {
    const integration = await getIntegrationWithToken(tenantId);
    const { mediaId } = await metaMediaClient.subir(
      integration.phoneNumberId,
      integration.accessToken,
      { buffer: audio.buffer, mimeType: MIME_NOTA_DE_VOZ, nombreArchivo },
    );

    return await sendOutbound(
      tenantId,
      clienteId,
      {
        modo: 'media',
        tipo: 'audio',
        metaMediaId: mediaId,
        mediaKey: guardado.key,
        mimeType: guardado.mimeType,
        tamanoBytes: guardado.tamanoBytes,
        esNotaDeVoz: true,
        duracionSegundos: audio.duracionSegundos,
      },
      'agent',
    );
  } catch (err: unknown) {
    // Misma limpieza best-effort que `enviarMediaSaliente` (allí se explica el `Promise.resolve()`).
    void Promise.resolve()
      .then(() => storage.eliminar(guardado.key))
      .catch((e: unknown) => {
        logger.warn('No se pudo limpiar la nota de voz huérfana', {
          key: guardado.key,
          error: String(e),
        });
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
