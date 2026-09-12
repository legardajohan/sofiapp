import type { Types } from 'mongoose';
import type { ZodSchema } from 'zod';
import type { ChatTurn, SlotSpec, ClassifyLeadOutput } from '../../integrations/llm/llm-provider.types.js';

export interface AiResult<T> {
  data: T;
  cacheHit: boolean;
  /** `true` si la respuesta salió de una FAQ y no hubo generación (HU-KB-02). */
  fromFaq?: boolean;
  /**
   * Fragmentos de la KB que sustentaron la respuesta (HU-IA-01). Solo lo informa `chat()`; llega
   * vacío cuando la respuesta salió de la caché o de una FAQ, porque ahí no hubo recuperación.
   * Ausente en `extract`/`classify`/`summarize`, que no hacen RAG.
   */
  retrievedChunks?: RetrievedChunk[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
}

/**
 * Resultado del cortocircuito por FAQ. Se declara aquí (y no se importa de
 * `features/kb-faq/`) para que este servicio transversal no dependa de un feature:
 * el cableado real ocurre solo en `createAIService`.
 */
export interface FaqMatchResult {
  matched: boolean;
  respuesta?: string;
  confianza?: number;
}

export type FaqMatcher = (
  tenantId: Types.ObjectId,
  pregunta: string,
) => Promise<FaqMatchResult>;

/**
 * Fragmento de conocimiento recuperado de la KB (HU-IA-01). Estructuralmente compatible con
 * `KbRetrievalResult` (`features/kb/kb.types.ts`) y con `IRetrievedChunk`
 * (`ai-response-context.model.ts`): los tres son `{ texto, documentId, score? }`, así que no
 * hace falta conversión en ninguna dirección.
 */
export interface RetrievedChunk {
  texto: string;
  documentId: string;
  score?: number;
}

/**
 * Puerto de recuperación (RAG). Se declara aquí —y no se importa de `features/kb/`— por la misma
 * razón que `FaqMatcher`: este servicio transversal no puede depender de un feature. El cableado
 * real con `searchKnowledge` ocurre solo en `createAIService`.
 */
export type KnowledgeRetriever = (
  tenantId: Types.ObjectId,
  query: string,
) => Promise<RetrievedChunk[]>;

export interface AiChatParams {
  tenantId: Types.ObjectId;
  historial: ChatTurn[];
  tono?: string;
  instrucciones?: string;
}

export interface AiExtractParams {
  tenantId: Types.ObjectId;
  historial: ChatTurn[];
  schema: ZodSchema;
  camposObjetivo: SlotSpec[];
}

export interface AiClassifyParams {
  tenantId: Types.ObjectId;
  historial: ChatTurn[];
}

export interface AiSummarizeParams {
  tenantId: Types.ObjectId;
  historial: ChatTurn[];
}

/**
 * Salida del clasificador ya saneada por `AIService.classify` (HU-IA-05): `confianza` recortada a
 * `[0, 1]` y `motivo` recortado. Es el mismo shape que `ClassifyLeadOutput` del puerto —se
 * reexporta en vez de duplicarlo— porque el servicio no añade campos, solo garantiza rangos.
 */
export type ClassifyResult = ClassifyLeadOutput;
