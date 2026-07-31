import type { Document, Types } from 'mongoose';

export interface IKbFaq {
  tenantId: Types.ObjectId;
  pregunta: string;
  respuesta: string;
  embedding: number[]; // dimensión KB_EMBED_DIM; se calcula sobre la PREGUNTA, no la respuesta
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IKbFaqDocument extends IKbFaq, Document {
  _id: Types.ObjectId;
}

/** Documento leído con `.lean()`: sin métodos de Mongoose, con `_id` garantizado. */
export type LeanKbFaq = IKbFaq & { _id: Types.ObjectId };

// ─── DTOs / contratos HTTP ──────────────────────────────────────────────────
export interface CreateFaqDTO {
  pregunta: string;
  respuesta: string;
  activo?: boolean;
}

export interface UpdateFaqDTO {
  pregunta?: string;
  respuesta?: string;
  activo?: boolean;
}

export interface TestFaqDTO {
  pregunta: string;
}

/** Proyección segura hacia el cliente: NUNCA incluye `embedding`. */
export interface IKbFaqResponse {
  id: string;
  pregunta: string;
  respuesta: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KbFaqsListResponse {
  data: IKbFaqResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface DeleteKbFaqResponse {
  deleted: boolean;
}

// ─── Matching semántico ─────────────────────────────────────────────────────
/**
 * Resultado del cortocircuito. `confianza` es el score de Atlas, normalizado a [0,1]
 * como (1 + coseno) / 2 — no es el coseno crudo.
 */
export interface FaqMatchResult {
  matched: boolean;
  respuesta?: string;
  confianza?: number;
}

/**
 * Diagnóstico para el probador del admin: devuelve el mejor candidato **aunque no
 * supere el umbral**, para poder calibrar `FAQ_MATCH_THRESHOLD` con datos reales.
 */
export interface FaqTestResult extends FaqMatchResult {
  umbral: number;
  faqId?: string;
  pregunta?: string; // la pregunta de la FAQ candidata, no la que escribió el admin
}
