import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/**
 * Techo global del multipart. Es el mayor de los límites por tipo; la validación fina —qué mime es
 * y cuánto puede pesar ESE tipo— vive en `media.service`, que es donde está la regla de negocio.
 *
 * `memoryStorage` y no `diskStorage`: los archivos son de 16 MB como mucho y un temporal en disco
 * añadiría limpieza, permisos y un modo de fallo más. Si algún día se sube el techo de documentos
 * a los 100 MB que admite Meta, hay que cambiar esto **antes**: 100 MB × N subidas simultáneas es
 * un OOM esperando.
 */
function techoGlobal(): number {
  return Math.max(
    env.MEDIA_MAX_BYTES_IMAGEN,
    env.MEDIA_MAX_BYTES_VIDEO,
    env.MEDIA_MAX_BYTES_AUDIO,
    env.MEDIA_MAX_BYTES_DOCUMENTO,
  );
}

/** Opciones de una subida de un solo archivo. */
export interface IOpcionesSubidaUnica {
  /** Nombre del campo del multipart que trae el archivo. */
  campo: string;
  maxBytes: number;
  /** Campos de texto admitidos junto al archivo. multer corta con 400 si llegan más. */
  maxCampos: number;
  /** Texto del 400 cuando llega más de un archivo o en otro campo. */
  mensajeVariosArchivos: string;
}

/**
 * Traduce los errores de multer a `AppError`.
 *
 * Sin esta traducción, un `LIMIT_FILE_SIZE` —el fallo más frecuente en producción, porque es lo que
 * pasa cada vez que alguien adjunta algo grande— llega al `errorHandler` como un error desconocido
 * y sale como **500 opaco**, cuando es un 413 perfectamente explicable.
 */
function traducirErrorMulter(err: unknown, mensajeVariosArchivos: string): unknown {
  if (!(err instanceof MulterError)) return err;
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new AppError('El archivo supera el tamaño permitido.', 413);
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError(mensajeVariosArchivos, 400);
  }
  return new AppError(`No se pudo procesar el archivo: ${err.message}`, 400);
}

/**
 * Construye un middleware que recibe **un** archivo del campo indicado y traduce los errores de
 * multer a `AppError`.
 *
 * Es la única excepción admitida a la cadena fija de middlewares, y va **entre `authorize` y
 * `validate`**: `validate` necesita `req.body` ya poblado con los campos de texto del multipart.
 */
export function crearSubidaUnica(opciones: IOpcionesSubidaUnica): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: opciones.maxBytes, files: 1, fields: opciones.maxCampos },
  });

  return (req, res, next) => {
    upload.single(opciones.campo)(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      next(traducirErrorMulter(err, opciones.mensajeVariosArchivos));
    });
  };
}

/** Adjuntos del hilo (HU-OMNI-06): campo `archivo`. */
export const subirArchivo: RequestHandler = crearSubidaUnica({
  campo: 'archivo',
  maxBytes: techoGlobal(),
  maxCampos: 4,
  mensajeVariosArchivos: 'Solo se puede adjuntar un archivo por mensaje.',
});

/**
 * Nota de voz (HU-OMNI-07): campo `audio`, con su propio techo —el de audio— y no el global. Así una
 * grabación de 16 MB se corta en multer en vez de llegar a memoria completa para descubrir después
 * que el tenant solo admite 2 MB (ese segundo filtro, más fino, está en `media.service`).
 */
export const subirAudio: RequestHandler = crearSubidaUnica({
  campo: 'audio',
  maxBytes: env.MEDIA_MAX_BYTES_AUDIO,
  maxCampos: 4,
  mensajeVariosArchivos: 'Solo se puede adjuntar un archivo por mensaje.',
});

/**
 * Imagen de cabecera de una campaña programada (HU-MARK-03): campo `imagen`, con el techo de
 * imágenes de Meta (5 MB). Admite más campos de texto que el hilo: nombre, filtros, plantilla,
 * parámetros, fecha y la marca de quitar imagen.
 */
export const subirImagenCampana: RequestHandler = crearSubidaUnica({
  campo: 'imagen',
  maxBytes: Math.min(env.MEDIA_MAX_BYTES_IMAGEN, 5 * 1024 * 1024),
  maxCampos: 8,
  mensajeVariosArchivos: 'Solo se puede adjuntar una imagen por campaña.',
});
