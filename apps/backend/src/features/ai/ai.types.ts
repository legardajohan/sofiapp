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
