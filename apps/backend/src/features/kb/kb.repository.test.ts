import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { buildVectorSearchPipeline } from './kb.repository.js';

type VectorStage = {
  $vectorSearch: { filter: { tenantId: Types.ObjectId }; limit: number; queryVector: number[] };
};
type MatchStage = { $match: { tenantId: Types.ObjectId } };
type AddFieldsStage = { $addFields: { score: { $meta: string } } };
type ProjectStage = { $project: Record<string, 0 | 1> };

const QUERY_VECTOR = [0.1, 0.2, 0.3];

/**
 * El aislamiento se verifica sobre el PIPELINE CONSTRUIDO, no ejecutándolo: `$vectorSearch` es un
 * stage exclusivo de Atlas y `mongodb-memory-server` no lo implementa, así que un test de
 * integración del tipo "buscar con tenantB no devuelve chunks de tenantA" no es escribible aquí.
 * Lo que sí se puede garantizar —y es donde vive el riesgo real— es que el `tenantId` del filtro
 * y el del `$match` nacen siempre del argumento y nunca del llamador.
 */
describe('buildVectorSearchPipeline — aislamiento multi-tenant', () => {
  it('inyecta el tenantId del argumento en el filtro del $vectorSearch', () => {
    const tenantId = new Types.ObjectId();
    const [vectorStage] = buildVectorSearchPipeline(tenantId, QUERY_VECTOR, 5) as unknown as [VectorStage];

    expect(vectorStage.$vectorSearch.filter.tenantId.toString()).toBe(tenantId.toString());
  });

  it('acepta tenantId como string y lo convierte a ObjectId en el filtro', () => {
    const tenantId = new Types.ObjectId().toString();
    const [vectorStage] = buildVectorSearchPipeline(tenantId, QUERY_VECTOR, 5) as unknown as [VectorStage];

    expect(vectorStage.$vectorSearch.filter.tenantId).toBeInstanceOf(Types.ObjectId);
    expect(vectorStage.$vectorSearch.filter.tenantId.toString()).toBe(tenantId);
  });

  it('añade un $match { tenantId } defensivo con el mismo tenant', () => {
    const tenantId = new Types.ObjectId();
    const pipeline = buildVectorSearchPipeline(tenantId, QUERY_VECTOR, 5) as unknown as [
      VectorStage,
      MatchStage,
      ProjectStage,
    ];
    expect(pipeline[1].$match.tenantId.toString()).toBe(tenantId.toString());
  });

  it('expone el score de vectorSearch y excluye el campo embedding de la proyección', () => {
    const tenantId = new Types.ObjectId();
    const pipeline = buildVectorSearchPipeline(tenantId, QUERY_VECTOR, 5) as unknown as [
      VectorStage,
      MatchStage,
      AddFieldsStage,
      ProjectStage,
    ];
    expect(pipeline[2].$addFields.score.$meta).toBe('vectorSearchScore');
    expect(pipeline[3].$project.embedding).toBe(0);
  });

  it('respeta k como límite de resultados', () => {
    const tenantId = new Types.ObjectId();
    const [vectorStage] = buildVectorSearchPipeline(tenantId, QUERY_VECTOR, 7) as unknown as [VectorStage];
    expect(vectorStage.$vectorSearch.limit).toBe(7);
  });
});
