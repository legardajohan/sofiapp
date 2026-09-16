import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import type {
  IArchivoLeido,
  IGuardarMediaInput,
  IMediaStorage,
  IObjetoAlmacenado,
  MediaKey,
} from './storage.types.js';

/**
 * Resuelve una clave a una ruta absoluta **dentro** del directorio de media, o lanza.
 *
 * La guarda no es decorativa: una clave es un identificador que viaja por la red y acaba en un
 * `path.join`. Sin comprobar que el resultado sigue colgando de la base, un `../../../etc/passwd`
 * convertiría `GET /api/media/:id` en una lectura arbitraria del disco del servidor.
 *
 * Se compara contra `base + path.sep` y no contra `base` a secas para que un directorio hermano con
 * el mismo prefijo (`/var/media-privado` frente a `/var/media`) no pase el filtro.
 */
function resolverRuta(key: MediaKey): string {
  const base = path.resolve(env.MEDIA_LOCAL_DIR);
  const absoluta = path.resolve(base, key);

  if (absoluta !== base && !absoluta.startsWith(base + path.sep)) {
    throw new AppError('Clave de archivo inválida.', 400);
  }

  return absoluta;
}

/**
 * Almacenamiento en disco para desarrollo. Existe para que levantar el entorno local no exija
 * credenciales de un bucket real ni una pieza más en `docker-compose`.
 *
 * No firma URLs (`urlFirmada` devuelve `null`): el controller lo interpreta como "sirve tú el
 * stream". Tampoco implementa `Range`, así que en desarrollo no se puede buscar dentro de un video
 * —en producción sí, porque Spaces lo soporta sobre la URL prefirmada—.
 */
export const localDiskStorage: IMediaStorage = {
  driver: 'local',

  async guardar({ key, contenido, mimeType }: IGuardarMediaInput): Promise<IObjetoAlmacenado> {
    const absoluta = resolverRuta(key);
    await mkdir(path.dirname(absoluta), { recursive: true });
    await writeFile(absoluta, contenido);

    return { key, mimeType, tamanoBytes: contenido.byteLength };
  },

  async leer(key: MediaKey): Promise<IArchivoLeido> {
    const absoluta = resolverRuta(key);

    let tamanoBytes: number;
    try {
      const info = await stat(absoluta);
      tamanoBytes = info.size;
    } catch {
      throw new AppError('Archivo no encontrado.', 404);
    }

    return {
      stream: createReadStream(absoluta),
      // El disco no guarda el mime; lo conoce el `Message` que apunta a esta clave, y es el
      // controller quien pone la cabecera. Aquí se devuelve vacío en vez de adivinar por extensión.
      mimeType: '',
      tamanoBytes,
    };
  },

  async urlFirmada(): Promise<string | null> {
    return null;
  },

  async eliminar(key: MediaKey): Promise<void> {
    await rm(resolverRuta(key), { force: true });
  },
};
