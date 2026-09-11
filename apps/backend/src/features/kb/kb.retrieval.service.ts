import type { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { GeminiProvider } from '../../integrations/llm/gemini.provider.js';
import type { ILlmProvider } from '../../integrations/llm/llm-provider.types.js';
import { vectorSearchScoped } from './kb.repository.js';
import type { KbRetrievalResult } from './kb.types.js';

/**
 * Recupera los `k` fragmentos de conocimiento más relevantes para `query`, aislados
 * por tenant. Es la puerta de entrada del RAG que consumirán HU-IA-01/02.
 *
 * El `provider` es inyectable (default `GeminiProvider`) para permitir tests y el
 * cambio de proveedor sin tocar el dominio.
 */
export async function searchKnowledge(
  tenantId: string | Types.ObjectId,
  query: string,
  k: number = env.KB_RETRIEVAL_K,
  provider: ILlmProvider = new GeminiProvider(),
): Promise<KbRetrievalResult[]> {
  const { result: vectors } = await provider.embedTexts({
    texts: [query],
    taskType: 'RETRIEVAL_QUERY',
  });
  const queryVector = vectors[0];
  if (!queryVector) return [];

  const chunks = await vectorSearchScoped(tenantId, queryVector, k);
  // Descarta lo irrelevante (HU-IA-01): `$vectorSearch` devuelve siempre el top-k, aunque el mejor
  // candidato no tenga nada que ver. Meter ruido en el contexto es justo lo que provoca respuestas
  // inventadas, así que es preferible quedarse sin contexto y que el asistente lo admita.
  return chunks
    .filter((c) => (c.score ?? 0) >= env.KB_MIN_SCORE)
    .map((c) => ({
      texto: c.texto,
      documentId: c.documentId.toString(),
      ...(c.score !== undefined ? { score: c.score } : {}),
    }));
}
