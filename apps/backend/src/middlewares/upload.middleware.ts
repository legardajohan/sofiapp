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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: techoGlobal(), files: 1, fields: 4 },
});

/**
 * Nota de voz (HU-OMNI-07): su propio techo, el de audio, y no el global. Así una grabación de
 * 16 MB se corta en multer en vez de llegar a memoria completa para descubrir después que el
 * tenant solo admite 2 MB (ese segundo filtro, más fino, está en `media.service`).
 */
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MEDIA_MAX_BYTES_AUDIO, files: 1, fields: 4 },
});

/**
 * Traduce los errores de multer a `AppError`.
 *
 * Sin esta traducción, un `LIMIT_FILE_SIZE` —el fallo más frecuente en producción, porque es lo que
 * pasa cada vez que alguien adjunta algo grande— llega al `errorHandler` como un error desconocido
 * y sale como **500 opaco**, cuando es un 413 perfectamente explicable.
 */
function traducirErrorMulter(err: unknown): unknown {
  if (!(err instanceof MulterError)) return err;
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new AppError('El archivo supera el tamaño permitido.', 413);
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError('Solo se puede adjuntar un archivo por mensaje.', 400);
  }
  return new AppError(`No se pudo procesar el archivo: ${err.message}`, 400);
}

function unArchivo(instancia: multer.Multer, campo: string): RequestHandler {
  return (req, res, next) => {
    instancia.single(campo)(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      next(traducirErrorMulter(err));
    });
  };
}

/**
 * Recibe **un** archivo del campo `archivo` (HU-OMNI-06).
 *
 * Es la única excepción admitida a la cadena fija de middlewares, y va **entre `authorize` y
 * `validate`**: `validate` necesita `req.body` ya poblado con los campos de texto del multipart.
 */
export const subirArchivo: RequestHandler = unArchivo(upload, 'archivo');

/** Recibe **una** grabación del campo `audio` (HU-OMNI-07). Misma posición en la cadena. */
export const subirAudio: RequestHandler = unArchivo(uploadAudio, 'audio');
