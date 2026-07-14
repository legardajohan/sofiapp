import { Types, type PipelineStage } from 'mongoose';
import { env } from '../../config/env.js';
import { KbChunk } from './kb-chunk.model.js';
import type { IKbChunk } from './kb.types.js';

type TenantId = string | Types.ObjectId;

function toObjectId(id: TenantId): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

export type ScoredChunk = IKbChunk & { _id: Types.ObjectId; score?: number };

/**
 * Construye el pipeline `$vectorSearch` de Atlas.
 *
 * NÚCLEO DE AISLAMIENTO: el `filter.tenantId` nace SIEMPRE del argumento `tenantId`
 * (nunca del caller) y se refuerza con un `$match` defensivo posterior. El campo
 * `embedding` se excluye de la proyección (payload innecesario).
 */
export function buildVectorSearchPipeline(
  tenantId: TenantId,
  queryVector: number[],
  k: number,
): PipelineStage[] {
  const tid = toObjectId(tenantId);
  const vectorStage = {
    $vectorSearch: {
      index: env.KB_VECTOR_INDEX,
      path: 'embedding',
      queryVector,
      numCandidates: k * 10,
      limit: k,
      filter: { tenantId: tid },
    },
  } as unknown as PipelineStage;

  return [
    vectorStage,
    { $match: { tenantId: tid } },
    { $addFields: { score: { $meta: 'vectorSearchScore' } } },
    { $project: { embedding: 0 } },
  ];
}

/**
 * Recuperación semántica tenant-safe. Único lugar autorizado a emitir un
 * `aggregate`/`$vectorSearch` sobre `KbChunk`.
 */
export async function vectorSearchScoped(
  tenantId: TenantId,
  queryVector: number[],
  k: number,
): Promise<ScoredChunk[]> {
  const pipeline = buildVectorSearchPipeline(tenantId, queryVector, k);
  return KbChunk.aggregate<ScoredChunk>(pipeline).exec();
}
