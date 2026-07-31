import { Types, type PipelineStage } from 'mongoose';
import { env } from '../../config/env.js';
import { KbFaq } from './kb-faq.model.js';
import type { IKbFaq } from './kb-faq.types.js';

type TenantId = string | Types.ObjectId;

function toObjectId(id: TenantId): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

export type ScoredFaq = IKbFaq & { _id: Types.ObjectId; score?: number };

/**
 * Construye el pipeline `$vectorSearch` de Atlas sobre las FAQs.
 *
 * NÚCLEO DE AISLAMIENTO: el `filter.tenantId` nace SIEMPRE del argumento `tenantId`
 * (nunca del caller) y se refuerza con un `$match` defensivo posterior. `activo: true`
 * va en ambos sitios para que una FAQ desactivada no pueda responder jamás. El campo
 * `embedding` se excluye de la proyección: el vector no sale de este repositorio.
 */
export function buildFaqVectorSearchPipeline(
  tenantId: TenantId,
  queryVector: number[],
): PipelineStage[] {
  const tid = toObjectId(tenantId);
  const vectorStage = {
    $vectorSearch: {
      index: env.FAQ_VECTOR_INDEX,
      path: 'embedding',
      queryVector,
      // Solo interesa el mejor candidato, pero Atlas necesita explorar un vecindario
      // razonable para que ese "mejor" sea fiable.
      numCandidates: 20,
      limit: 1,
      filter: { tenantId: tid, activo: true },
    },
  } as unknown as PipelineStage;

  return [
    vectorStage,
    { $match: { tenantId: tid, activo: true } },
    { $addFields: { score: { $meta: 'vectorSearchScore' } } },
    { $project: { embedding: 0 } },
  ];
}

/**
 * Búsqueda semántica tenant-safe sobre FAQs. Único lugar autorizado a emitir un
 * `aggregate`/`$vectorSearch` sobre `KbFaq`.
 */
export async function faqVectorSearchScoped(
  tenantId: TenantId,
  queryVector: number[],
): Promise<ScoredFaq[]> {
  const pipeline = buildFaqVectorSearchPipeline(tenantId, queryVector);
  return KbFaq.aggregate<ScoredFaq>(pipeline).exec();
}
