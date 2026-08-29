export type AiUsageMethod = 'chat' | 'extract' | 'classify' | 'summary';

export interface AiResponseSummary {
  id: string;
  method: AiUsageMethod;
  model: string;
  cacheHit: boolean;
  fromFaq: boolean;
  durationMs: number;
  tokens: { prompt: number; completion: number; total: number };
  createdAt: string;
}

export interface AiRetrievedChunk {
  texto: string;
  documentId: string;
  score?: number;
}

export interface AiResponseContextDetail extends AiResponseSummary {
  kbVersion: number | null;
  promptSnapshot: { method: string; version: string; systemPrompt: string } | null;
  retrievedChunks: AiRetrievedChunk[];
  contextAvailable: boolean;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}
