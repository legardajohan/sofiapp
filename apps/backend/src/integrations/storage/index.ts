import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { localDiskStorage } from './local-disk.storage.js';
import { spacesStorage } from './spaces.storage.js';
import type { IMediaStorage, MediaKey } from './storage.types.js';

export type {
  IArchivoLeido,
  IGuardarMediaInput,
  IMediaStorage,
  IObjetoAlmacenado,
  MediaDriver,
  MediaKey,
} from './storage.types.js';

let instancia: IMediaStorage | null = null;

/**
 * El almacenamiento de media según `MEDIA_DRIVER`. Perezoso: el adaptador de Spaces construye un
 * `S3Client` y no debe hacerlo en un entorno que nunca lo va a usar.
 */
export function getMediaStorage(): IMediaStorage {
  if (!instancia) {
    instancia = env.MEDIA_DRIVER === 'spaces' ? spacesStorage : localDiskStorage;
  }
  return instancia;
}

/**
 * Inyecta un doble en los tests y limpia el singleton al pasar `null`.
 *
 * Es lo que permite al test de aislamiento comprobar algo que de otro modo no se puede observar:
 * que ante un `messageId` de otro tenant el adaptador **no llega a invocarse**. Que el corte ocurra
 * antes de tocar el objeto es la diferencia entre un fallo de autorización y una fuga.
 */
export function setMediaStorageForTests(doble: IMediaStorage | null): void {
  instancia = doble;
}

/** Extensiones por mime, para que la clave termine en algo reconocible por un humano y por el SO. */
const EXTENSION_POR_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

/**
 * Construye la clave de un objeto: `<tenantId>/<messageId>/<uuid>.<ext>`.
 *
 * **Ningún trozo viene del cliente.** El nombre original del archivo se guarda en el `Message`, no
 * en la ruta: es texto que escribió un desconocido y aquí acabaría concatenado a un `path`.
 * El `uuid` evita además que dos reintentos del mismo mensaje se pisen.
 */
export function construirMediaKey(
  tenantId: string,
  messageId: string,
  mimeType: string,
): MediaKey {
  const ext = EXTENSION_POR_MIME[mimeType.toLowerCase()] ?? 'bin';
  return `${tenantId}/${messageId}/${randomUUID()}.${ext}`;
}
