import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { AiUsageLogModel } from '../../services/ai/ai-usage-log.model.js';
import { AiResponseContextModel } from '../../services/ai/ai-response-context.model.js';
import { getAiResponseContext, listAiResponses } from './ai.service.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

async function crearUsageLog(tenantId: Types.ObjectId): Promise<Types.ObjectId> {
  const doc = await createScoped(AiUsageLogModel, tenantId, {
    method: 'chat',
    llmModel: 'gemini-1.5-flash',
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    cacheHit: false,
    fromFaq: false,
    durationMs: 120,
  });
  return doc._id as Types.ObjectId;
}

describe('HU-KB-04 — aislamiento multi-tenant de la trazabilidad de respuestas', () => {
  beforeEach(async () => {
    await AiUsageLogModel.deleteMany({});
    await AiResponseContextModel.deleteMany({});
  });

  it('el tenantB no puede leer el contexto de una respuesta del tenantA → 404, nunca 403', async () => {
    const usageLogId = await crearUsageLog(tenantA);
    await createScoped(AiResponseContextModel, tenantA, {
      usageLogId,
      promptSnapshot: { method: 'chat', version: '1.0.0', systemPrompt: 'Prompt de A' },
      retrievedChunks: [],
      kbVersion: 1,
    });

    await expect(
      getAiResponseContext(tenantB.toString(), usageLogId.toString()),
    ).rejects.toMatchObject({ statusCode: 404 });

    // Y sigue intacta para su dueño.
    const dto = await getAiResponseContext(tenantA.toString(), usageLogId.toString());
    expect(dto.contextAvailable).toBe(true);
    expect(dto.promptSnapshot?.systemPrompt).toBe('Prompt de A');
  });

  it('el listado del tenantB no incluye respuestas del tenantA', async () => {
    await crearUsageLog(tenantA);
    await crearUsageLog(tenantA);
    await crearUsageLog(tenantB);

    const listaB = await listAiResponses(tenantB.toString(), { page: 1, limit: 20 });
    expect(listaB.total).toBe(1);

    const listaA = await listAiResponses(tenantA.toString(), { page: 1, limit: 20 });
    expect(listaA.total).toBe(2);
  });
});
