import type { Readable } from 'node:stream';

export type MediaDriver = 'local' | 'spaces';

/**
 * Clave opaca dentro del almacenamiento. Siempre POSIX (`/`) y **siempre generada por nosotros**:
 * nunca se construye con un nombre de archivo que venga del cliente. Forma:
 * `<tenantId>/<messageId>/<uuid>.<ext>`.
 *
 * El `tenantId` va primero a propósito. El aislamiento real lo da `findByIdScoped` sobre `Message`
 * —quien tiene la clave tiene el objeto—, pero el prefijo hace que una fuga sea visible de un
 * vistazo en el bucket y permite purgar una empresa entera con un solo barrido.
 */
export type MediaKey = string;

export interface IObjetoAlmacenado {
  key: MediaKey;
  mimeType: string;
  tamanoBytes: number;
}

export interface IArchivoLeido {
  stream: Readable;
  mimeType: string;
  tamanoBytes: number;
}

export interface IGuardarMediaInput {
  key: MediaKey;
  contenido: Buffer;
  mimeType: string;
  /** Para el `Content-Disposition` del objeto. No forma parte de la clave. */
  nombreArchivo?: string;
}

/**
 * Puerto de almacenamiento de media. Dos adaptadores: disco local en desarrollo (sin infraestructura
 * nueva) y DO Spaces en producción. Ver `docs/adr/0008-almacenamiento-de-media.md`.
 */
export interface IMediaStorage {
  readonly driver: MediaDriver;

  guardar(input: IGuardarMediaInput): Promise<IObjetoAlmacenado>;

  /** Lectura en streaming. Lanza `AppError(…, 404)` si la clave no existe. */
  leer(key: MediaKey): Promise<IArchivoLeido>;

  /**
   * URL prefirmada de vida corta, o **`null` si el adaptador no sabe firmar** (disco local).
   * Ese `null` es la señal con la que el controller decide entre responder `302` o servir el stream:
   * el controller no pregunta por el driver, pregunta por la capacidad.
   */
  urlFirmada(key: MediaKey, expiraEnS?: number): Promise<string | null>;

  eliminar(key: MediaKey): Promise<void>;
}
