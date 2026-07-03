import type { Types } from 'mongoose';
import type { ZodSchema } from 'zod';
import type { ChatTurn, SlotSpec, NivelInteres, Objecion } from '../../integrations/llm/llm-provider.types.js';

export interface AiResult<T> {
  data: T;
  cacheHit: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
}

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

export type ClassifyResult = { nivelInteres: NivelInteres; objecion: Objecion | null };
