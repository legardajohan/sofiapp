import { Document, Types } from 'mongoose';
import type { TipoMediaSaliente } from '../media/media.types.js';

export type Direccion = 'inbound' | 'outbound';
export type Sender = 'user' | 'bot' | 'agent';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

/**
 * Tipo de contenido del mensaje, en español como el resto del vocabulario de dominio
 * (`apps/backend/CLAUDE.md` → Naming). Migrado desde el enum en inglés en HU-OMNI-06.
 *
 * `enlace` es un mensaje de texto que además contiene una URL: se clasifica aparte para poder
 * renderizar la tarjeta de previsualización, pero **sigue llevando texto** — ver `esTipoConTexto`.
 */
export type TipoMensaje =
  | 'texto'
  | 'enlace'
  | 'imagen'
  | 'video'
  | 'audio'
  | 'documento'
  | 'sticker'
  | 'plantilla'
  | 'otro';

/**
 * Tipos cuyo `texto` es contenido real del cliente y no un pie de foto opcional.
 *
 * Existe porque `enlace` rompe la comparación ingenua `tipo !== 'texto'`: quien preguntaba eso lo
 * hacía para saber si Sofi podía leer el mensaje, y un enlace se lee perfectamente. Sin esta lista,
 * mandar un link dispararía el acuse de "solo entiendo texto" (`MENSAJE_SOLO_TEXTO`), que es una
 * regresión visible para el cliente final. **Toda** decisión de "¿esto tiene texto?" pasa por aquí.
 */
export const TIPOS_CON_TEXTO: readonly TipoMensaje[] = ['texto', 'enlace'];

export function esTipoConTexto(tipo: TipoMensaje): boolean {
  return TIPOS_CON_TEXTO.includes(tipo);
}

/**
 * Enum anterior a HU-OMNI-06 → actual. Lo consume el script de migración
 * (`scripts/migrate-tipo-mensaje.ts`) y `normalizarTipoMensaje`.
 *
 * `video` y `sticker` no aparecen: antes caían en `other` y el payload original no se guardó, así
 * que no hay nada que recuperar. Se quedan en `otro`, que es la verdad.
 */
export const TIPO_MENSAJE_LEGACY: Readonly<Record<string, TipoMensaje>> = {
  text: 'texto',
  image: 'imagen',
  audio: 'audio',
  document: 'documento',
  template: 'plantilla',
  other: 'otro',
};

/**
 * Normaliza un `tipo` leído de Mongo que pueda venir del enum anterior. Idempotente.
 *
 * Se aplica de forma **permanente** en el mapper, no solo durante la migración: `.lean()` no valida
 * contra el enum del schema, así que un documento heredado que se escape del script —una réplica,
 * un backup restaurado— llegaría al frontend como `"text"` y no se sabría pintar.
 */
export function normalizarTipoMensaje(tipo: string): TipoMensaje {
  return TIPO_MENSAJE_LEGACY[tipo] ?? (tipo as TipoMensaje);
}

/**
 * Tipos de la Cloud API de WhatsApp → dominio. Fuente única: antes de HU-OMNI-06 existían dos
 * `mapMsgType` duplicados (el del normalizador, que era código muerto, y el privado del processor
 * de entrantes) que había que mantener sincronizados a mano.
 */
export const TIPO_POR_TIPO_META: Readonly<Record<string, TipoMensaje>> = {
  text: 'texto',
  image: 'imagen',
  video: 'video',
  audio: 'audio',
  document: 'documento',
  sticker: 'sticker',
};

export function mapTipoMensajeMeta(type: string): TipoMensaje {
  return TIPO_POR_TIPO_META[type] ?? 'otro';
}

/**
 * Ciclo de vida del archivo de un mensaje multimedia.
 *
 * `pendiente` existe porque la ingesta es asíncrona: el mensaje se persiste y aparece en el hilo de
 * inmediato, y los bytes llegan después por la cola `media-ingest`. Sin este estado habría que
 * elegir entre retrasar el `message:new` varios segundos o perder el mensaje si la descarga falla.
 */
export type EstadoMedia = 'pendiente' | 'disponible' | 'fallida';

export interface IMensajeMedia {
  estado: EstadoMedia;
  mimeType: string;
  /** Clave en `IMediaStorage`. **Nunca sale al navegador**: el DTO expone una URL firmada. */
  mediaKey?: string;
  /** Id del media en Meta. Entrante: con él se descarga. Saliente: el que devolvió `POST /media`. */
  metaMediaId?: string;
  /** El que puso el cliente (solo documentos) o el que subió el asesor. */
  nombreArchivo?: string;
  tamanoBytes?: number;
  sha256?: string;
  duracionSegundos?: number;
  /** Declarado para que añadir miniaturas propias sea aditivo; hoy nunca se rellena (ADR-0008). */
  miniaturaKey?: string;
  intentos?: number;
  /** Motivo del fallo definitivo. Se le muestra al asesor, así que va en español y sin jerga. */
  error?: string;
  descargadaAt?: Date;
}

/**
 * Previsualización de un enlace compartido. Solo dominio y URL: la Cloud API **no envía metadata
 * Open Graph** en los webhooks entrantes, así que el título y la imagen no existen del lado del
 * receptor. La tarjeta rica la renderiza WhatsApp en el teléfono del cliente gracias a
 * `preview_url: true` en el envío.
 */
export interface IPreviewEnlace {
  url: string;
  dominio: string;
}

export interface IMessage {
  tenantId: Types.ObjectId;
  clienteId: Types.ObjectId;
  canal: 'whatsapp';
  direccion: Direccion;
  sender: Sender;
  tipo: TipoMensaje;
  /** Texto libre, o el **caption** de una imagen, un video o un documento. */
  texto?: string;
  /**
   * @deprecated HU-OMNI-06. Solo documentos anteriores al feature y el seed de demo. La media nueva
   * vive en `media`, que guarda una clave de almacenamiento en vez de una URL suelta.
   */
  attachmentUrl?: string;
  media?: IMensajeMedia;
  previewEnlace?: IPreviewEnlace;
  metaMessageId?: string;
  status: MessageStatus;
  createdAt: Date;
}

export interface IMessageDocument extends IMessage, Document {}

export interface ICreateMessageDto {
  tenantId: Types.ObjectId;
  clienteId: Types.ObjectId;
  canal: 'whatsapp';
  direccion: Direccion;
  sender: Sender;
  tipo: TipoMensaje;
  texto?: string;
  media?: IMensajeMedia;
  previewEnlace?: IPreviewEnlace;
  metaMessageId?: string;
  status: MessageStatus;
}

export interface ISendMessageDto {
  clienteId: string;
  texto: string;
  /**
   * Quién escribe el mensaje saliente. Default `'agent'` (asesor humano), que es el
   * comportamiento previo a HU-IA-01. La respuesta automática de Sofi usa `'bot'` para que la
   * bandeja, la auditoría y el transcript que alimenta el resumen por IA puedan distinguirla.
   */
  sender?: Extract<Sender, 'agent' | 'bot'>;
}

/**
 * `sendOutbound` (`message.service.ts`) es el único juez de la ventana de 24 h. `auto` deja que
 * decida entre texto libre y `plantillaFallback`; `texto`/`plantilla` fuerzan un modo concreto
 * (la bandeja usa `texto`, `POST /api/messages/template` usa `plantilla`).
 */
export type ContenidoOutbound =
  | { modo: 'auto'; texto: string; plantillaFallback?: { templateId: string; parametros: string[] } }
  | { modo: 'texto'; texto: string }
  | { modo: 'plantilla'; templateId: string; parametros: string[] }
  /**
   * Archivo YA guardado en nuestro almacenamiento y YA subido a Meta (HU-OMNI-06). `sendOutbound`
   * no sube nada: recibe el `metaMediaId` hecho, decide si la ventana permite el envío y persiste.
   *
   * Es contenido libre, así que rige la MISMA regla que `'texto'`: fuera de la ventana, 422. Meta
   * no acepta media libre fuera de ventana, y la única alternativa —plantilla con cabecera
   * multimedia— está fuera del alcance de este feature.
   */
  | {
      modo: 'media';
      tipo: TipoMediaSaliente;
      metaMediaId: string;
      mediaKey: string;
      mimeType: string;
      tamanoBytes: number;
      nombreArchivo?: string;
      caption?: string;
    };

export interface ISendTemplateDto {
  clienteId: string;
  templateId: string;
  parametros: string[];
}
