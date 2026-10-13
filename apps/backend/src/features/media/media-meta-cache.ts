import type { Types } from 'mongoose';
import { getMediaStorage } from '../../integrations/storage/index.js';
import { metaMediaClient } from '../../integrations/meta/meta-media.client.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { getIntegrationWithToken } from '../channel/channel.service.js';
import type { IImagenCabeceraAlmacenada } from './media.types.js';

type TenantId = string | Types.ObjectId;

/**
 * Vida útil que se le da a un `metaMediaId`. Meta lo conserva 30 días; se renueva a los 25 para que
 * un lote que arranca el día 29 no se quede con un id que caduca a mitad del envío.
 */
export const VIDA_MEDIA_META_MS = 25 * 24 * 60 * 60 * 1000;

export async function leerComoBuffer(mediaKey: string): Promise<Buffer> {
  const { stream } = await getMediaStorage().leer(mediaKey);
  const trozos: Buffer[] = [];
  for await (const trozo of stream) {
    trozos.push(Buffer.isBuffer(trozo) ? trozo : Buffer.from(trozo as Uint8Array));
  }
  return Buffer.concat(trozos);
}

export interface IOpcionesMetaMediaId {
  /** Nombre con el que Meta registra el archivo; solo informativo. */
  nombreArchivo: string;
  /** Texto del 502 si Meta no acepta la imagen: cada dueño lo dice a su manera. */
  mensajeError: string;
  /** Guarda el id recién obtenido en el documento dueño de la imagen (plantilla o campaña). */
  persistir: (metaMediaId: string, subidaMetaAt: Date) => Promise<void>;
}

/**
 * Devuelve el `media id` de Meta de una imagen de cabecera, subiéndola a `/{PHONE_NUMBER_ID}/media`
 * solo si no hay id o si el que hay ya venció (HU-MARK-03, generalizado en HT-WA-04 a la imagen por
 * defecto de las plantillas).
 *
 * El id se cachea en el documento dueño mediante `persistir`: así una campaña de 10 000 contactos
 * sube su imagen **una** vez, y las siguientes campañas con la imagen por defecto de la misma
 * plantilla reutilizan el id de la plantilla.
 */
export async function asegurarMetaMediaId(
  tenantId: TenantId,
  imagen: IImagenCabeceraAlmacenada,
  opciones: IOpcionesMetaMediaId,
): Promise<string> {
  const subidaAt = imagen.subidaMetaAt ? new Date(imagen.subidaMetaAt).getTime() : null;
  if (imagen.metaMediaId && subidaAt !== null && Date.now() - subidaAt < VIDA_MEDIA_META_MS) {
    return imagen.metaMediaId;
  }

  let mediaId: string;
  try {
    const integration = await getIntegrationWithToken(tenantId);
    const buffer = await leerComoBuffer(imagen.mediaKey);
    ({ mediaId } = await metaMediaClient.subir(integration.phoneNumberId, integration.accessToken, {
      buffer,
      mimeType: imagen.mimeType,
      nombreArchivo: opciones.nombreArchivo,
    }));
  } catch (err) {
    logger.error('No se pudo subir la imagen de cabecera a Meta', {
      mediaKey: imagen.mediaKey,
      error: String(err),
    });
    throw new AppError(opciones.mensajeError, 502);
  }

  await opciones.persistir(mediaId, new Date());
  return mediaId;
}

/** Extensión para el nombre del archivo en Meta. */
export function extensionImagen(mimeType: string): 'png' | 'jpg' {
  return mimeType === 'image/png' ? 'png' : 'jpg';
}
