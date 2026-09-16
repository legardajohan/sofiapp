import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';
import { findByIdScoped, findOneAndUpdateScoped } from '../repositories/base.repository.js';
import { Message } from '../features/message/message.model.js';
import type { TipoMensaje } from '../features/message/message.types.js';
import { getIntegrationWithToken } from '../features/channel/channel.service.js';
import { esMediaExpirada, metaMediaClient } from '../integrations/meta/meta-media.client.js';
import { construirMediaKey, getMediaStorage } from '../integrations/storage/index.js';
import { publishRealtime } from '../realtime/realtime.publisher.js';
import { toMessageResponse, type IMessageSource } from '../features/conversation/conversation.mapper.js';

export interface MediaIngestJobData {
  tenantId: string;
  /** `_id` del `Message` ya guardado. El tipo y el media id salen de Mongo, no del job. */
  messageId: string;
  clienteId: string;
}

/**
 * Identidad del job de descarga. Determinista para que reencolar el mismo mensaje mientras el job
 * sigue vivo sea un no-op de BullMQ.
 *
 * **Sin `:` en el identificador.** BullMQ los rechaza en un `jobId` personalizado
 * (`Custom Id cannot contain :`). Fue el defecto de HT-AI-02: el auto-reply no se encolaba jamás y
 * la suite entera pasaba en verde, porque el mock de la cola acepta cualquier id.
 */
export function mediaIngestJobId(tenantId: string, messageId: string): string {
  return `media-${tenantId}-${messageId}`;
}

/** Techo de descarga según el tipo del mensaje. */
function maxBytesPara(tipo: TipoMensaje): number {
  switch (tipo) {
    case 'imagen':
    case 'sticker':
      return env.MEDIA_MAX_BYTES_IMAGEN;
    case 'video':
      return env.MEDIA_MAX_BYTES_VIDEO;
    case 'audio':
      return env.MEDIA_MAX_BYTES_AUDIO;
    default:
      return env.MEDIA_MAX_BYTES_DOCUMENTO;
  }
}

/** Reproyecta el mensaje y avisa al hilo de que su media cambió de estado. */
async function notificarMediaActualizada(
  tenantId: string,
  clienteId: string,
  messageId: string,
): Promise<void> {
  const doc = await findByIdScoped(Message, tenantId, messageId).lean();
  if (!doc) return;

  await publishRealtime({
    type: 'message:updated',
    tenantId,
    conversationId: clienteId,
    message: toMessageResponse(doc as unknown as IMessageSource, tenantId),
  });
}

/**
 * Marca la media como fallida de forma definitiva y lo comunica al hilo.
 *
 * Se publica el evento **igual que en el caso de éxito**: el asesor tiene que enterarse de que el
 * archivo no va a llegar, no quedarse con un esqueleto girando para siempre.
 */
export async function marcarMediaFallida(
  tenantId: string,
  messageId: string,
  clienteId: string,
  motivo: string,
): Promise<void> {
  await findOneAndUpdateScoped(
    Message,
    tenantId,
    { _id: new Types.ObjectId(messageId) },
    { $set: { 'media.estado': 'fallida', 'media.error': motivo } },
  );
  await notificarMediaActualizada(tenantId, clienteId, messageId);
}

/**
 * Descarga la media de un mensaje entrante y la guarda en nuestro almacenamiento.
 *
 * Función pura respecto de BullMQ —el `Worker` se construye en `worker.ts`— para poder probar la
 * clasificación de errores sin Redis.
 *
 * La URL de descarga de Meta **no se persiste nunca**: caduca en unos cinco minutos, así que se
 * resuelve aquí, en el momento de ejecutar. Por eso un reintento a la hora sigue funcionando
 * (Meta guarda la media unos 30 días) y por eso la caducidad de la URL no es argumento para hacer
 * esto en línea con la ingesta.
 */
export async function processMediaIngestJob(data: MediaIngestJobData): Promise<void> {
  const { tenantId, messageId, clienteId } = data;

  const msg = await findByIdScoped(Message, tenantId, messageId).lean();
  if (!msg) {
    logger.warn('Ingesta de media: el mensaje ya no existe', { tenantId, messageId });
    return;
  }

  // Idempotencia por estado, no solo por `jobId`: el jobId protege mientras el job vive en Redis,
  // pero un webhook repetido después de que se purgue volvería a encolar. Esto es lo que aguanta.
  if (msg.media?.estado === 'disponible') return;

  const mediaId = msg.media?.metaMediaId;
  if (!mediaId) {
    await marcarMediaFallida(tenantId, messageId, clienteId, 'El mensaje no trae identificador de archivo.');
    return;
  }

  try {
    const integration = await getIntegrationWithToken(tenantId);
    const meta = await metaMediaClient.obtenerMetadata(mediaId, integration.accessToken);
    const maxBytes = maxBytesPara(msg.tipo);

    const archivo = await metaMediaClient.descargar(meta.url, integration.accessToken, maxBytes);

    const key = construirMediaKey(tenantId, messageId, archivo.mimeType || meta.mimeType);
    const guardado = await getMediaStorage().guardar({
      key,
      contenido: archivo.buffer,
      mimeType: archivo.mimeType || meta.mimeType,
      ...(msg.media?.nombreArchivo ? { nombreArchivo: msg.media.nombreArchivo } : {}),
    });

    await findOneAndUpdateScoped(
      Message,
      tenantId,
      { _id: new Types.ObjectId(messageId) },
      {
        $set: {
          'media.estado': 'disponible',
          'media.mediaKey': guardado.key,
          'media.mimeType': guardado.mimeType,
          'media.tamanoBytes': guardado.tamanoBytes,
          'media.descargadaAt': new Date(),
        },
        $unset: { 'media.error': '' },
      },
    );

    await notificarMediaActualizada(tenantId, clienteId, messageId);
  } catch (err: unknown) {
    await findOneAndUpdateScoped(
      Message,
      tenantId,
      { _id: new Types.ObjectId(messageId) },
      { $inc: { 'media.intentos': 1 } },
    );

    // Errores DEFINITIVOS: no se lanzan, porque reintentarlos no arregla nada y solo llenaría la
    // cola de fallidos. El archivo caducó en Meta (410) o no cabe (413): en ambos casos el asesor
    // necesita saberlo ya, no dentro de tres backoffs.
    if (esMediaExpirada(err) || (err instanceof AppError && err.statusCode === 413)) {
      const motivo =
        err instanceof AppError ? err.message : 'No se pudo descargar el archivo.';
      logger.warn('Ingesta de media: fallo definitivo', { tenantId, messageId, motivo });
      await marcarMediaFallida(tenantId, messageId, clienteId, motivo);
      return;
    }

    // Recuperable (429, 5xx, red): se relanza para que BullMQ aplique el backoff. Si agota los
    // intentos, el listener `failed` de `worker.ts` es el que marca la media como fallida.
    logger.error('Ingesta de media: fallo recuperable', {
      tenantId,
      messageId,
      error: String(err),
    });
    throw err;
  }
}
