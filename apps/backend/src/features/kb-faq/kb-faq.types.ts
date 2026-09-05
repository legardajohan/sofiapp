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
 * Las tres señales del cortocircuito, tal como las evaluó el service (HU-KB-02-V2).
 * Solo viaja en el probador del admin: el flujo de conversación no las necesita.
 */
export interface FaqTestSenales {
  score: number;
  /** Score del segundo candidato. Ausente si el tenant solo tenía una FAQ activa. */
  segundoScore?: number;
  margen: number;
  overlap: number;
  pasaUmbral: boolean;
  pasaMargen: boolean;
  pasaOverlap: boolean;
}

/**
 * Diagnóstico para el probador del admin: devuelve el mejor candidato **aunque no
 * supere las señales**, para poder calibrar los tres mínimos con datos reales.
 */
export interface FaqTestResult extends FaqMatchResult {
  umbral: number;
  margenMinimo: number;
  overlapMinimo: number;
  faqId?: string;
  pregunta?: string; // la pregunta de la FAQ candidata, no la que escribió el admin
  /** Pregunta del segundo candidato: es lo que explica un margen pequeño. */
  segundaPregunta?: string;
  /** Ausente si no hubo ningún candidato que evaluar. */
  senales?: FaqTestSenales;
}
