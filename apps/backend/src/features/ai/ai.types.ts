import type { Types } from 'mongoose';
import type { IAiUsageLog } from '../../services/ai/ai-usage-log.model.js';
import type { IAiResponseContext } from '../../services/ai/ai-response-context.model.js';

export interface IAiUsageLogLean extends IAiUsageLog {
  _id: Types.ObjectId;
  createdAt: Date;
}

export interface IAiResponseContextLean extends IAiResponseContext {
  _id: Types.ObjectId;
  createdAt: Date;
}

export interface AiResponseSummaryDTO {
  id: string;
  method: 'chat' | 'extract' | 'classify' | 'summary';
  model: string;
  cacheHit: boolean;
  fromFaq: boolean;
  durationMs: number;
  tokens: { prompt: number; completion: number; total: number };
  createdAt: string;
}

export interface AiResponseContextDTO extends AiResponseSummaryDTO {
  kbVersion: number | null;
  promptSnapshot: { method: string; version: string; systemPrompt: string } | null;
  retrievedChunks: Array<{ texto: string; documentId: string; score?: number }>;
  contextAvailable: boolean;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export type AiUsageMethod = 'chat' | 'extract' | 'classify' | 'summary';

export interface ListAiResponsesQuery {
  page: number;
  limit: number;
  method?: AiUsageMethod;
}

// ─── Chatbot con RAG (HU-IA-01) ─────────────────────────────────────────────

export interface AiAnswerRequestDTO {
  mensaje: string;
}

export interface AiAnswerResponseDTO {
  respuesta: string;
  /** `true` si salió de una FAQ literal, sin generación ni RAG. */
  fromFaq: boolean;
  cacheHit: boolean;
  /** Cuántos fragmentos de la KB sustentaron la respuesta. `0` con caché, FAQ o KB sin material. */
  chunksUsados: number;
}

/** Configuración efectiva del asistente de un tenant: la suya, o la global como fallback. */
export interface AssistantConfigDTO {
  tono: string;
  systemPrompt: string;
  /** `true` si el tenant aún no tiene plantilla propia y está viendo la global. */
  heredado: boolean;
  version: string;
}

export interface UpdateAssistantDTO {
  tono: string;
  systemPrompt: string;
}
