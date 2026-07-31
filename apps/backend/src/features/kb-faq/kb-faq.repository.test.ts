import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { buildFaqVectorSearchPipeline } from './kb-faq.repository.js';

// `$vectorSearch` solo existe en Atlas: mongodb-memory-server no puede ejecutarlo.
// Verificamos el pipeline CONSTRUIDO, que es donde vive el invariante de aislamiento.

type VectorStage = {
  $vectorSearch: {
    index: string;
    filter: { tenantId: Types.ObjectId; activo: boolean };
    limit: number;
    numCandidates: number;
    queryVector: number[];
  };
};
type MatchStage = { $match: { tenantId: Types.ObjectId; activo: boolean } };
type AddFieldsStage = { $addFields: { score: { $meta: string } } };
type ProjectStage = { $project: Record<string, 0 | 1> };
type FaqPipeline = [VectorStage, MatchStage, AddFieldsStage, ProjectStage];

const QUERY_VECTOR = [0.1, 0.2, 0.3];

const build = (tenantId: string | Types.ObjectId): FaqPipeline =>
  buildFaqVectorSearchPipeline(tenantId, QUERY_VECTOR) as unknown as FaqPipeline;

describe('buildFaqVectorSearchPipeline — aislamiento multi-tenant', () => {
  it('inyecta el tenantId del argumento en el filtro del $vectorSearch', () => {
    const tenantId = new Types.ObjectId();
    const [vectorStage] = build(tenantId);

    expect(vectorStage.$vectorSearch.filter.tenantId.toString()).toBe(tenantId.toString());
  });

  it('acepta tenantId como string y lo convierte a ObjectId en el filtro', () => {
    const tenantId = new Types.ObjectId().toString();
    const [vectorStage] = build(tenantId);

    expect(vectorStage.$vectorSearch.filter.tenantId).toBeInstanceOf(Types.ObjectId);
    expect(vectorStage.$vectorSearch.filter.tenantId.toString()).toBe(tenantId);
  });

  it('añade un $match defensivo con el mismo tenant después del $vectorSearch', () => {
    const tenantId = new Types.ObjectId();
    const pipeline = build(tenantId);

    expect(pipeline[1].$match.tenantId.toString()).toBe(tenantId.toString());
  });

  it('filtra por activo: true en el $vectorSearch y en el $match defensivo', () => {
    const pipeline = build(new Types.ObjectId());

    expect(pipeline[0].$vectorSearch.filter.activo).toBe(true);
    expect(pipeline[1].$match.activo).toBe(true);
  });

  it('expone el score de vectorSearch y excluye el embedding de la proyección', () => {
    const pipeline = build(new Types.ObjectId());

    expect(pipeline[2].$addFields.score.$meta).toBe('vectorSearchScore');
    expect(pipeline[3].$project.embedding).toBe(0);
  });

  it('pide un solo candidato usando el índice configurado por entorno', () => {
    const pipeline = build(new Types.ObjectId());

    expect(pipeline[0].$vectorSearch.limit).toBe(1);
    expect(pipeline[0].$vectorSearch.numCandidates).toBeGreaterThan(1);
    expect(pipeline[0].$vectorSearch.index).toBe(env.FAQ_VECTOR_INDEX);
  });
});
