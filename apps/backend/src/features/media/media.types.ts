import type { EstadoMedia, TipoMensaje } from '../message/message.types.js';

/** Los tres tipos que un asesor puede enviar desde el composer (HU-OMNI-06). */
export type TipoMediaSaliente = 'imagen' | 'video' | 'documento';

export interface ILimiteMedia {
  mimes: readonly string[];
  maxBytes: number;
}

/**
 * Qué archivos acepta la Cloud API y hasta qué tamaño.
 *
 * Verificado contra developers.facebook.com/docs/whatsapp/cloud-api/reference/media el 2026-09-16.
 * Meta los ajusta sin avisar, así que la fecha importa tanto como los números.
 *
 * **`image/svg+xml` y `text/html` están fuera a propósito, no por olvido.** Servir un SVG o un HTML
 * `inline` desde nuestro propio origen es XSS almacenado con la cookie de sesión al alcance: basta
 * con que un cliente mande el archivo y alguien lo abra desde la bandeja.
 *
 * El tope real de cada envío es `min(maxBytes, env.MEDIA_MAX_BYTES_*)`.
 */
export const LIMITES_MEDIA: Readonly<Record<TipoMediaSaliente, ILimiteMedia>> = {
  imagen: {
    mimes: ['image/jpeg', 'image/png'],
    maxBytes: 5 * 1024 * 1024,
  },
  video: {
    // Meta exige H.264 + AAC y una sola pista de audio; un mp4 con AC-3 lo rechaza con un error
    // opaco que no se distingue de un problema de red.
    mimes: ['video/mp4', 'video/3gpp'],
    maxBytes: 16 * 1024 * 1024,
  },
  documento: {
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
    ],
    maxBytes: 100 * 1024 * 1024,
  },
};

/** Mimes que también aceptamos al **recibir**, aunque no se puedan enviar desde el composer. */
export const MIMES_ENTRANTES_EXTRA: readonly string[] = [
  'image/webp', // stickers
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/amr',
  'audio/ogg',
];

/** Tipos de mensaje que llevan archivo adjunto. */
export const TIPOS_CON_MEDIA: readonly TipoMensaje[] = [
  'imagen',
  'video',
  'audio',
  'documento',
  'sticker',
];

export function esTipoConMedia(tipo: TipoMensaje): boolean {
  return TIPOS_CON_MEDIA.includes(tipo);
}

/** Lo que el token firmado de la URL de media transporta, ya verificado. */
export interface IMediaTokenPayload {
  tenantId: string;
  messageId: string;
  /** Epoch en segundos. */
  exp: number;
}

/** Proyección de `Message.media` lista para servir el archivo. */
export interface IMediaDescargable {
  mediaKey: string;
  mimeType: string;
  nombreArchivo: string | null;
  tamanoBytes: number | null;
  tipo: TipoMensaje;
}

/** La media tal y como la ve el frontend. La clave de almacenamiento nunca aparece aquí. */
export interface IMediaResponse {
  estado: EstadoMedia;
  mimeType: string;
  nombreArchivo: string | null;
  tamanoBytes: number | null;
  /** `/media/<id>?t=<token>`; `null` mientras el archivo no esté `disponible`. */
  urlArchivo: string | null;
  error: string | null;
}
