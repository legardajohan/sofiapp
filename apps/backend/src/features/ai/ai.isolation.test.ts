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

/** Fija `createdAt` por el driver: Mongoose trata ese timestamp como inmutable y lo ignora en un update. */
async function fecharLog(id: Types.ObjectId, createdAt: Date): Promise<void> {
  await AiUsageLogModel.collection.updateOne({ _id: id }, { $set: { createdAt } });
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

  it('con rango de fechas, el listado de A no trae registros de B dentro del mismo rango (HU-REP-05-V2)', async () => {
    const dentro = new Date('2026-10-02T12:00:00.000Z');
    const propio = await crearUsageLog(tenantA);
    await fecharLog(propio, dentro);
    await fecharLog(await crearUsageLog(tenantB), dentro);
    await fecharLog(await crearUsageLog(tenantB), dentro);

    const rango = { desde: new Date('2026-10-01T00:00:00.000Z'), hasta: new Date('2026-10-03T00:00:00.000Z') };
    const listaA = await listAiResponses(tenantA.toString(), { page: 1, limit: 20, ...rango });

    expect(listaA.total).toBe(1);
    expect(listaA.data.map((r) => r.id)).toEqual([propio.toString()]);
  });
});
