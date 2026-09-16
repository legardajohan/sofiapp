import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Meta responde 403 a clientes sin `User-Agent` en algunos endpoints de media. Es un fallo
 * desconcertante —el token es válido y el id existe— así que se fija siempre.
 */
const USER_AGENT = 'SofiApp/1.0 (+https://sofiapp.co)';

/**
 * El Media ID caducó o Meta ya no lo sirve. **No se arregla reintentando**, así que el processor lo
 * distingue para marcar el mensaje como fallido en el primer intento en vez de gastar los tres y
 * dejar el hilo girando varios minutos.
 *
 * Se señala con el código `410` y no con una subclase de `AppError` a propósito: el constructor de
 * `AppError` hace `Object.setPrototypeOf(this, AppError.prototype)`, así que cualquier subclase
 * pierde su identidad y `instanceof MiError` devolvería `false`. El código de estado es un
 * discriminante que no se puede romper por accidente.
 */
export const HTTP_MEDIA_EXPIRADA = 410;

export function mediaExpirada(mediaId: string): AppError {
  return new AppError(
    'El archivo ya no está disponible en WhatsApp (el enlace de Meta expiró).',
    HTTP_MEDIA_EXPIRADA,
    { mediaId },
  );
}

/** ¿Este error es "la media ya no existe" y por tanto definitivo? */
export function esMediaExpirada(err: unknown): boolean {
  return err instanceof AppError && err.statusCode === HTTP_MEDIA_EXPIRADA;
}

export interface IMetaMediaMetadata {
  id: string;
  url: string;
  mimeType: string;
  sha256?: string;
  fileSize?: number;
}

export interface IArchivoDescargado {
  buffer: Buffer;
  mimeType: string;
  tamanoBytes: number;
}

export interface IMetaMediaClient {
  /** `GET /{mediaId}` → metadata con una `url` de descarga que **caduca en unos 5 minutos**. */
  obtenerMetadata(mediaId: string, accessToken: string): Promise<IMetaMediaMetadata>;
  /** Descarga la URL temporal. Aborta en cuanto supera `maxBytes`, sin bufferizar el resto. */
  descargar(url: string, accessToken: string, maxBytes: number): Promise<IArchivoDescargado>;
  /** `POST /{phoneNumberId}/media` → id reutilizable durante 30 días. */
  subir(
    phoneNumberId: string,
    accessToken: string,
    archivo: { buffer: Buffer; mimeType: string; nombreArchivo: string },
  ): Promise<{ mediaId: string }>;
}

async function conReintentos<T>(
  etiqueta: string,
  fn: () => Promise<Response>,
  alOk: (res: Response) => Promise<T>,
  mediaId?: string,
): Promise<T> {
  for (let intento = 0; ; intento += 1) {
    const res = await fn();

    // Misma política que `meta-whatsapp.client.ts`: solo 429 y 5xx merecen otra oportunidad.
    if ((res.status === 429 || res.status >= 500) && intento < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, intento);
      logger.warn('Meta media: reintentando', { etiqueta, status: res.status, intento, delay });
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    // 404/410 = el media ya no existe. Reintentar no lo resucita.
    if ((res.status === 404 || res.status === 410) && mediaId) {
      throw mediaExpirada(mediaId);
    }

    if (!res.ok) {
      const texto = await res.text();
      throw new AppError(`Error Graph API media (${res.status}): ${texto}`, 502);
    }

    return alOk(res);
  }
}

export const metaMediaClient: IMetaMediaClient = {
  async obtenerMetadata(mediaId: string, accessToken: string): Promise<IMetaMediaMetadata> {
    const url = `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${mediaId}`;

    return conReintentos(
      'metadata',
      () =>
        fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': USER_AGENT },
        }),
      async (res) => {
        const data = (await res.json()) as {
          id?: string;
          url?: string;
          mime_type?: string;
          sha256?: string;
          file_size?: number;
        };
        if (!data.url) throw new AppError('Meta no devolvió la URL del archivo.', 502);

        return {
          id: data.id ?? mediaId,
          url: data.url,
          mimeType: data.mime_type ?? 'application/octet-stream',
          ...(data.sha256 ? { sha256: data.sha256 } : {}),
          ...(data.file_size ? { fileSize: data.file_size } : {}),
        };
      },
      mediaId,
    );
  },

  async descargar(url: string, accessToken: string, maxBytes: number): Promise<IArchivoDescargado> {
    return conReintentos(
      'descarga',
      () =>
        fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': USER_AGENT },
        }),
      async (res) => {
        const mimeType = res.headers.get('content-type') ?? 'application/octet-stream';

        // Primera barrera: si Meta declara un tamaño mayor que el permitido, se corta antes de
        // leer un solo byte del cuerpo.
        const declarado = Number(res.headers.get('content-length'));
        if (Number.isFinite(declarado) && declarado > maxBytes) {
          throw new AppError('El archivo supera el tamaño permitido.', 413);
        }

        // Segunda barrera: el `content-length` puede faltar o mentir, así que se cuenta lo que de
        // verdad llega y se aborta el stream en cuanto se pasa. Sin esto, un archivo enorme se
        // bufferiza entero en memoria antes de poder rechazarlo.
        if (!res.body) throw new AppError('Meta devolvió una respuesta vacía.', 502);

        const reader = res.body.getReader();
        const trozos: Buffer[] = [];
        let total = 0;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel();
            throw new AppError('El archivo supera el tamaño permitido.', 413);
          }
          trozos.push(Buffer.from(value));
        }

        return { buffer: Buffer.concat(trozos), mimeType, tamanoBytes: total };
      },
    );
  },

  async subir(
    phoneNumberId: string,
    accessToken: string,
    archivo: { buffer: Buffer; mimeType: string; nombreArchivo: string },
  ): Promise<{ mediaId: string }> {
    const url = `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${phoneNumberId}/media`;

    // `FormData`/`Blob` globales de Node 20+: no hace falta una dependencia de multipart. El
    // `Content-Type` NO se fija a mano a propósito — `fetch` tiene que poner el `boundary`.
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', archivo.mimeType);
    form.append(
      'file',
      new Blob([new Uint8Array(archivo.buffer)], { type: archivo.mimeType }),
      archivo.nombreArchivo,
    );

    return conReintentos(
      'subida',
      () =>
        fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': USER_AGENT },
          body: form,
        }),
      async (res) => {
        const data = (await res.json()) as { id?: string };
        if (!data.id) throw new AppError('Meta no devolvió el id del archivo subido.', 502);
        return { mediaId: data.id };
      },
    );
  },
};
