import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import type {
  IArchivoLeido,
  IGuardarMediaInput,
  IMediaStorage,
  IObjetoAlmacenado,
  MediaKey,
} from './storage.types.js';

let cliente: S3Client | null = null;

/**
 * Cliente perezoso: construirlo al importar el módulo rompería los tests y cualquier arranque con
 * `MEDIA_DRIVER=local`, que es el caso normal en desarrollo.
 *
 * Las credenciales se leen sin `?? ''` ni valores por defecto a propósito: `env.ts` ya garantiza con
 * su `superRefine` que existen cuando el driver es `spaces`, y un fallback vacío convertiría un
 * error de configuración en un 403 de DigitalOcean difícil de diagnosticar.
 */
function getCliente(): S3Client {
  if (cliente) return cliente;

  cliente = new S3Client({
    endpoint: env.SPACES_ENDPOINT as string,
    region: env.SPACES_REGION as string,
    credentials: {
      accessKeyId: env.SPACES_KEY as string,
      secretAccessKey: env.SPACES_SECRET as string,
    },
  });

  return cliente;
}

function bucket(): string {
  return env.SPACES_BUCKET as string;
}

/**
 * Almacenamiento en DO Spaces (S3-compatible) para producción.
 *
 * `GET /api/media/:id` no sirve estos bytes: responde un `302` a la URL prefirmada que devuelve
 * `urlFirmada`, para no pasar cada foto por el droplet. `leer` existe igualmente porque el
 * diagnóstico y los reintentos la necesitan.
 */
export const spacesStorage: IMediaStorage = {
  driver: 'spaces',

  async guardar({
    key,
    contenido,
    mimeType,
    nombreArchivo,
  }: IGuardarMediaInput): Promise<IObjetoAlmacenado> {
    await getCliente().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: contenido,
        ContentType: mimeType,
        ContentLength: contenido.byteLength,
        // `private` EXPLÍCITO, nunca por omisión. Un objeto público en un bucket compartido por
        // todos los tenants es una fuga de datos inmediata y silenciosa: la clave lleva el
        // `tenantId` dentro, así que basta con adivinarla. Ver ADR-0008.
        ACL: 'private',
        CacheControl: 'private, max-age=300',
        ...(nombreArchivo
          ? {
              ContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`,
            }
          : {}),
      }),
    );

    return { key, mimeType, tamanoBytes: contenido.byteLength };
  },

  async leer(key: MediaKey): Promise<IArchivoLeido> {
    try {
      const res = await getCliente().send(
        new GetObjectCommand({ Bucket: bucket(), Key: key }),
      );

      if (!res.Body) throw new AppError('Archivo no encontrado.', 404);

      return {
        stream: res.Body as Readable,
        mimeType: res.ContentType ?? '',
        tamanoBytes: res.ContentLength ?? 0,
      };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new AppError('Archivo no encontrado.', 404);
    }
  },

  async urlFirmada(key: MediaKey, expiraEnS?: number): Promise<string | null> {
    return getSignedUrl(getCliente(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
      expiresIn: expiraEnS ?? env.MEDIA_SIGNED_URL_TTL_S,
    });
  },

  async eliminar(key: MediaKey): Promise<void> {
    await getCliente().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  },
};
