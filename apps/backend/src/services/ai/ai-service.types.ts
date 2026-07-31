import type { Types } from 'mongoose';
import type { ZodSchema } from 'zod';
import type { ChatTurn, SlotSpec, NivelInteres, Objecion } from '../../integrations/llm/llm-provider.types.js';

export interface AiResult<T> {
  data: T;
  cacheHit: boolean;
  /** `true` si la respuesta salió de una FAQ y no hubo generación (HU-KB-02). */
  fromFaq?: boolean;
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

export type ClassifyResult = { nivelInteres: NivelInteres; objecion: Objecion | null };
