import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

const { mockVectorSearchScoped } = vi.hoisted(() => ({
  mockVectorSearchScoped: vi.fn(),
}));

// `$vectorSearch` es un stage de Atlas: `mongodb-memory-server` no lo soporta, así que el
// repositorio se mockea y aquí se prueba solo lo que aporta `searchKnowledge` encima de él.
// El aislamiento del pipeline vive en `kb.repository.test.ts`.
vi.mock('./kb.repository.js', () => ({
  vectorSearchScoped: mockVectorSearchScoped,
}));

import { searchKnowledge } from './kb.retrieval.service.js';
import { env } from '../../config/env.js';
import type { ILlmProvider } from '../../integrations/llm/llm-provider.types.js';

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function makeProvider(vectores: number[][] = [[0.1, 0.2, 0.3]]): ILlmProvider {
  return {
    embedTexts: vi.fn().mockResolvedValue({ result: vectores, usage: ZERO_USAGE }),
    generateReply: vi.fn(),
    extractSlots: vi.fn(),
    classifyLead: vi.fn(),
  } as unknown as ILlmProvider;
}

function chunk(texto: string, score: number) {
  return { texto, documentId: new Types.ObjectId(), score };
}

describe('searchKnowledge — filtro de relevancia (HU-IA-01)', () => {
  const tenantId = new Types.ObjectId();

  beforeEach(() => {
    mockVectorSearchScoped.mockReset();
  });

  it('descarta los fragmentos por debajo de KB_MIN_SCORE', async () => {
    mockVectorSearchScoped.mockResolvedValue([
      chunk('Relevante y de sobra', env.KB_MIN_SCORE + 0.1),
      chunk('Justo en el umbral', env.KB_MIN_SCORE),
      chunk('Ruido irrelevante', env.KB_MIN_SCORE - 0.2),
    ]);

    const resultados = await searchKnowledge(tenantId, '¿cuál es el horario?', 5, makeProvider());

    expect(resultados).toHaveLength(2);
    expect(resultados.map((r) => r.texto)).toEqual(['Relevante y de sobra', 'Justo en el umbral']);
  });

  it('si todo el top-k es irrelevante devuelve vacío, no el menos malo', async () => {
    mockVectorSearchScoped.mockResolvedValue([
      chunk('Nada que ver', 0.2),
      chunk('Tampoco', 0.1),
    ]);

    const resultados = await searchKnowledge(tenantId, 'pregunta sin respuesta', 5, makeProvider());

    expect(resultados).toEqual([]);
  });

  it('un chunk sin score se trata como irrelevante en vez de colarse en el contexto', async () => {
    mockVectorSearchScoped.mockResolvedValue([{ texto: 'Sin score', documentId: new Types.ObjectId() }]);

    const resultados = await searchKnowledge(tenantId, 'consulta', 5, makeProvider());

    expect(resultados).toEqual([]);
  });

  it('serializa el documentId a string para el consumidor', async () => {
    const documentId = new Types.ObjectId();
    mockVectorSearchScoped.mockResolvedValue([
      { texto: 'Contenido', documentId, score: 0.95 },
    ]);

    const resultados = await searchKnowledge(tenantId, 'consulta', 5, makeProvider());

    expect(resultados[0]?.documentId).toBe(documentId.toString());
  });

  it('sin vector de consulta no llega a tocar el repositorio', async () => {
    const resultados = await searchKnowledge(tenantId, 'consulta', 5, makeProvider([]));

    expect(resultados).toEqual([]);
    expect(mockVectorSearchScoped).not.toHaveBeenCalled();
  });

  it('propaga el tenantId recibido al repositorio, sin reinterpretarlo', async () => {
    mockVectorSearchScoped.mockResolvedValue([]);

    await searchKnowledge(tenantId, 'consulta', 3, makeProvider());

    expect(mockVectorSearchScoped).toHaveBeenCalledWith(tenantId, [0.1, 0.2, 0.3], 3);
  });
});
