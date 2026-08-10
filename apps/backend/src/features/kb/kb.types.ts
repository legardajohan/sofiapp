import type { Document, Types } from 'mongoose';

export type EstadoIndexacion = 'pendiente' | 'procesando' | 'indexado' | 'fallido';

// ─── Conocimiento estructurado (HU-KB-07) ───────────────────────────────────

export type KbTriEstado = 'si' | 'no' | 'na';

export interface KbScheduleDay {
  dia: string; // 'lunes' … 'domingo'; el orden lo impone el schema del frontend
  cerrado: boolean;
  intervalos: Array<{ desde: string; hasta: string }>; // 'HH:mm'
}

/**
 * Valor de un campo del formulario guiado. **Auto-descriptivo**: cada valor lleva su propio
 * discriminante `tipo`, así una versión futura puede leer una `estructura` guardada con un schema
 * viejo sin tener que adivinar cómo interpretarla.
 */
export type KbFieldValue =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'lista'; valores: string[] }
  | { tipo: 'triestado'; valor: KbTriEstado; detalle?: string }
  | { tipo: 'horario'; dias: KbScheduleDay[] }
  | { tipo: 'repetible'; items: Array<Record<string, string>> };

/**
 * Conocimiento capturado campo a campo por el modal guiado. El backend lo **guarda sin
 * interpretarlo**: quien lo entiende (y quien deriva el `contenido` textual a partir de él) es el
 * frontend, dueño de los schemas de campo. Ver `docs/specs/HU-KB-07-estructura-kb/plan.md`.
 */
export interface KbEstructura {
  /** Versión del CONTRATO de esquema, no del documento. Empieza en 1. */
  schemaVersion: number;
  /** Qué formulario la produjo: 'generico' hoy; 'empresa', 'horarios'… en HU-KB-08 y siguientes. */
  schemaId: string;
  campos: Record<string, KbFieldValue>;
  /** «Información adicional». Obligatorio en el contrato (puede ser ''), nunca ausente. */
  adicional: string;
}

export interface IKbDocument {
  tenantId: Types.ObjectId;
  titulo: string;
  contenido: string; // texto crudo (fuente para re-indexar)
  version: number; // incremental por documento (versionado por empresa)
  estadoIndexacion: EstadoIndexacion;
  chunkCount: number; // 0 hasta indexar
  isPreset: boolean; // documento base sembrado al crear el tenant (etiqueta de origen)
  obligatorio: boolean; // preset mínimo que la IA necesita para responder (no se puede eliminar)
  oculto: boolean; // soft-delete de un preset eliminado: sigue existiendo pero no se muestra
  proposito?: string; // guía de qué escribir (placeholder), típica de los presets
  error?: string; // motivo si estadoIndexacion === 'fallido'
  // Fuente de verdad de la EDICIÓN guiada; `contenido` lo sigue siendo de la indexación. Ausente en
  // los documentos de texto libre, que son la mayoría hasta que HU-KB-08 y siguientes los cubran.
  estructura?: KbEstructura;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IKbDocumentDocument extends IKbDocument, Document {
  _id: Types.ObjectId;
}

export interface IKbChunk {
  tenantId: Types.ObjectId;
  documentId: Types.ObjectId; // ref KbDocument
  version: number; // versión del documento a la que pertenece
  chunkIndex: number;
  texto: string;
  embedding: number[]; // dimensión KB_EMBED_DIM
}

export interface IKbChunkDocument extends IKbChunk, Document {
  _id: Types.ObjectId;
}

// ─── DTOs / contratos HTTP ──────────────────────────────────────────────────
export interface CreateKbDocumentDTO {
  titulo: string;
  contenido: string;
  estructura?: KbEstructura;
}

export interface UpdateKbDocumentDTO {
  contenido: string;
  // Ausente significa **NO TOCAR**, nunca "borrar": un guardado desde el modo legado no puede
  // destruir la estructura de un documento que ya la tenía.
  estructura?: KbEstructura;
}

export interface IKbDocumentResponse {
  id: string;
  titulo: string;
  contenido: string; // el listado lo expone para precargar el editor en modo edición
  estadoIndexacion: EstadoIndexacion;
  version: number;
  chunkCount: number;
  isPreset: boolean;
  obligatorio: boolean;
  // El listado expone los ocultos a propósito: el frontend reconstruye la grilla desde su catálogo
  // de presets y necesita distinguir "nunca se creó" de "se eliminó" para no reponer la tarjeta.
  oculto: boolean;
  proposito?: string;
  error?: string;
  // Presente solo en documentos con edición guiada; el modal decide por ella en qué modo abrir.
  estructura?: KbEstructura;
  createdAt: string;
  updatedAt: string;
}

export interface KbDocumentsListResponse {
  data: IKbDocumentResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface DeleteKbDocumentResponse {
  deleted: boolean;
}

// ─── Job BullMQ ─────────────────────────────────────────────────────────────
export interface KbIndexJobData {
  tenantId: string;
  documentId: string;
  version: number;
}

// ─── Recuperación (RAG) ─────────────────────────────────────────────────────
export interface KbRetrievalResult {
  texto: string;
  documentId: string;
  score?: number;
}
