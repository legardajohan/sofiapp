import type { Document, Types } from 'mongoose';

export type EstadoIndexacion = 'pendiente' | 'procesando' | 'indexado' | 'fallido';

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
}

export interface UpdateKbDocumentDTO {
  contenido: string;
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
