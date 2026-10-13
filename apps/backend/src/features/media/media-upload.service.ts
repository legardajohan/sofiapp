import type { Types } from 'mongoose';
import {
  createScoped,
  findOneAndUpdateScoped,
} from '../../repositories/base.repository.js';
import { construirSubidaMediaKey, getMediaStorage } from '../../integrations/storage/index.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import { MediaUpload } from './media-upload.model.js';
import { LIMITES_MEDIA, MIMES_IMAGEN_CABECERA } from './media.types.js';
import type {
  IImagenCabeceraAlmacenada,
  IImagenSubida,
  IUploadResponse,
  LeanMediaUpload,
  MimeImagenCabecera,
  PropositoSubida,
} from './media.types.js';

type TenantId = string | Types.ObjectId;

/** Vida de una subida sin consumir. El `header_handle` de Meta tampoco dura mucho más. */
const VIDA_SUBIDA_MS = 24 * 60 * 60 * 1000;

const SUBIDA_NO_DISPONIBLE = 'La imagen ya no está disponible. Súbela de nuevo.';

/** Tope real: el de Meta para imágenes (5 MB) o el del entorno, el que sea menor. */
export function maxBytesImagenCabecera(): number {
  return Math.min(LIMITES_MEDIA.imagen.maxBytes, env.MEDIA_MAX_BYTES_IMAGEN);
}

/**
 * Valida una imagen de cabecera: JPG o PNG de hasta 5 MB (HT-WA-04, criterio 2). Mismos códigos que
 * los adjuntos de HU-OMNI-06: 415 por tipo, 413 por tamaño.
 *
 * No reutiliza `media.service.clasificarArchivoSaliente` para no crear el ciclo
 * `media.service → message.service → whatsapp-template.service → aquí`.
 */
export function validarImagenCabecera(imagen: IImagenSubida): MimeImagenCabecera {
  const mime = imagen.mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (!(MIMES_IMAGEN_CABECERA as readonly string[]).includes(mime)) {
    throw new AppError('La imagen debe ser JPG o PNG.', 415, { mimeType: imagen.mimeType });
  }
  const max = maxBytesImagenCabecera();
  if (imagen.buffer.length > max) {
    const mb = Math.floor(max / (1024 * 1024));
    throw new AppError(`La imagen supera el tamaño permitido (${mb} MB).`, 413);
  }
  return mime as MimeImagenCabecera;
}

/** Borrado best-effort: un objeto huérfano es preferible a tapar el error real con otro. */
export function eliminarMediaSilenciosa(mediaKey: string): void {
  void Promise.resolve()
    .then(() => getMediaStorage().eliminar(mediaKey))
    .catch((err: unknown) => {
      logger.warn('No se pudo eliminar la imagen', { mediaKey, error: String(err) });
    });
}

export function toUploadResponse(subida: LeanMediaUpload): IUploadResponse {
  return {
    uploadId: subida._id.toString(),
    mimeType: subida.mimeType,
    tamanoBytes: subida.tamanoBytes,
  };
}

/**
 * Guarda la imagen bajo el prefijo del tenant y registra la subida pendiente.
 *
 * La imagen ya tiene que venir validada (`validarImagenCabecera`): quien llama decide el orden,
 * porque la muestra de plantilla pasa antes por Meta y el reemplazo no.
 */
export async function registrarSubida(
  tenantId: TenantId,
  imagen: IImagenSubida,
  mimeType: MimeImagenCabecera,
  proposito: PropositoSubida,
  headerHandle: string | null = null,
): Promise<LeanMediaUpload> {
  const guardado = await getMediaStorage().guardar({
    key: construirSubidaMediaKey(tenantId.toString(), proposito, mimeType),
    contenido: imagen.buffer,
    mimeType,
    nombreArchivo: imagen.nombreArchivo,
  });

  try {
    const creada = await createScoped(MediaUpload, tenantId, {
      proposito,
      mediaKey: guardado.key,
      mimeType,
      tamanoBytes: guardado.tamanoBytes,
      headerHandle,
      usadaAt: null,
      expiraEn: new Date(Date.now() + VIDA_SUBIDA_MS),
    });
    return creada.toObject() as LeanMediaUpload;
  } catch (err) {
    eliminarMediaSilenciosa(guardado.key);
    throw err;
  }
}

/**
 * Consume una subida **de este tenant** y de este propósito, una sola vez.
 *
 * El update condicional es atómico: dos peticiones con el mismo `uploadId` no pueden quedarse las
 * dos con la imagen. Otro tenant, ya usada o caducada dan el mismo 404 (sin oráculo de ids).
 */
export async function consumirSubida(
  tenantId: TenantId,
  uploadId: string,
  proposito: PropositoSubida,
): Promise<LeanMediaUpload> {
  const subida = await findOneAndUpdateScoped(
    MediaUpload,
    tenantId,
    { _id: uploadId, proposito, usadaAt: null, expiraEn: { $gt: new Date() } },
    { $set: { usadaAt: new Date() } },
    { new: true },
  ).lean<LeanMediaUpload | null>();
  if (!subida) throw new AppError(SUBIDA_NO_DISPONIBLE, 404);
  return subida;
}

/** Devuelve una subida consumida a pendiente: lo que vino después (p. ej. Meta) falló. */
export async function liberarSubida(tenantId: TenantId, uploadId: string): Promise<void> {
  await findOneAndUpdateScoped(MediaUpload, tenantId, { _id: uploadId }, { $set: { usadaAt: null } });
}

/** La subida, ya consumida, como imagen almacenada sin `media id` de Meta todavía. */
export function aImagenAlmacenada(subida: LeanMediaUpload): IImagenCabeceraAlmacenada {
  return {
    mediaKey: subida.mediaKey,
    mimeType: subida.mimeType,
    tamanoBytes: subida.tamanoBytes,
    metaMediaId: null,
    subidaMetaAt: null,
  };
}

/** Multer no deja nada en `req.file` si el formulario no traía el campo `imagen`. */
export function exigirImagen(imagen: IImagenSubida | undefined): IImagenSubida {
  if (!imagen) throw new AppError('Adjunta una imagen JPG o PNG.', 400);
  return imagen;
}

/** Archivo de multer → tipo del dominio, para que los services no conozcan Express. */
export function imagenDeArchivo(file: Express.Multer.File | undefined): IImagenSubida | undefined {
  if (!file) return undefined;
  return { buffer: file.buffer, mimeType: file.mimetype, nombreArchivo: file.originalname };
}
