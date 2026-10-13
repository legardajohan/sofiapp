import type { Document, Types } from 'mongoose';
import type { EstadoMedia, TipoMensaje } from '../message/message.types.js';

/**
 * Lo que un asesor puede enviar: los tres adjuntos del composer (HU-OMNI-06) y la nota de voz
 * grabada en el navegador (HU-OMNI-07). El audio **no** entra por el menú de adjuntar: tiene su
 * propio endpoint porque exige transcodificación y un límite por tenant.
 */
export type TipoMediaSaliente = 'imagen' | 'video' | 'documento' | 'audio';

/** Los que acepta `POST /messages/media` (el menú de adjuntar). El audio va por `/messages/audio`. */
export const TIPOS_ADJUNTABLES: readonly TipoMediaSaliente[] = ['imagen', 'video', 'documento'];

/**
 * Formato en el que sale **toda** nota de voz tras transcodificar. WhatsApp solo la presenta como
 * nota de voz —onda, icono de micrófono, "escuchada"— si es `audio/ogg` con Opus mono (ADR-0009).
 */
export const MIME_NOTA_DE_VOZ = 'audio/ogg';

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
  audio: {
    // Mimes de ENTRADA: lo que produce `MediaRecorder` en cada navegador (webm/opus en Chrome, Edge
    // y Firefox; mp4/aac en Safari) más los formatos que ya son de voz. Lo que sale hacia Meta es
    // siempre `MIME_NOTA_DE_VOZ`, porque el servidor transcodifica.
    mimes: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a'],
    maxBytes: 16 * 1024 * 1024,
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
  /** Solo audio/video. `null` si no se pudo medir: el reproductor la toma de los metadatos. */
  duracionSegundos: number | null;
  /** `true` si es una nota de voz (grabada) y no un archivo de audio. */
  esNotaDeVoz: boolean;
}

/** Límite de grabación que el navegador necesita para cortar a tiempo (HU-OMNI-07). */
export interface IConfigAudioResponse {
  maxDuracionSegundos: number;
  maxBytes: number;
}

// ─── Imagen de cabecera de plantillas (HT-WA-04) ─────────────────────────────────

/** Mimes que Meta acepta como imagen de cabecera de una plantilla: JPG y PNG, hasta 5 MB. */
export const MIMES_IMAGEN_CABECERA = ['image/jpeg', 'image/png'] as const;
export type MimeImagenCabecera = (typeof MIMES_IMAGEN_CABECERA)[number];

/** Archivo de imagen tal y como lo deja multer, ya traducido a dominio. */
export interface IImagenSubida {
  buffer: Buffer;
  mimeType: string;
  nombreArchivo: string;
}

/**
 * Imagen guardada en nuestro almacenamiento con la caché de su `media id` en Meta.
 *
 * Mismo shape en la imagen por defecto de una plantilla y en la de reemplazo de una campaña: el
 * `metaMediaId` dura ~30 días en Meta y se renueva a los 25 (`asegurarMetaMediaId`).
 */
export interface IImagenCabeceraAlmacenada {
  mediaKey: string;
  mimeType: MimeImagenCabecera;
  tamanoBytes: number;
  metaMediaId: string | null;
  subidaMetaAt: Date | null;
}

/**
 * Para qué se subió una imagen en dos pasos:
 * - `muestra-plantilla`: ejemplo de la cabecera que revisa Meta al crear la plantilla. Lleva el
 *   `header_handle` de la Resumable Upload API y queda como imagen por defecto.
 * - `cabecera-reemplazo`: imagen distinta para una campaña o un envío, sin reaprobar la plantilla.
 */
export const PROPOSITOS_SUBIDA = ['muestra-plantilla', 'cabecera-reemplazo'] as const;
export type PropositoSubida = (typeof PROPOSITOS_SUBIDA)[number];

export interface IMediaUpload {
  tenantId: Types.ObjectId;
  proposito: PropositoSubida;
  mediaKey: string;
  mimeType: MimeImagenCabecera;
  tamanoBytes: number;
  headerHandle: string | null;
  /** `null` mientras nadie la haya consumido: una subida se usa una sola vez. */
  usadaAt: Date | null;
  /** El TTL de Mongo borra el documento al llegar aquí (el handle de Meta también caduca). */
  expiraEn: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IMediaUploadDocument extends IMediaUpload, Document {
  _id: Types.ObjectId;
}

export type LeanMediaUpload = IMediaUpload & { _id: Types.ObjectId };

/** Respuesta de las subidas en dos pasos. El cliente solo maneja el `uploadId`, nunca la clave. */
export interface IUploadResponse {
  uploadId: string;
  mimeType: MimeImagenCabecera;
  tamanoBytes: number;
}
