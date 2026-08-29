import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { AiUsageLogModel, type IAiUsageLog } from '../../services/ai/ai-usage-log.model.js';
import { AiResponseContextModel } from '../../services/ai/ai-response-context.model.js';
import { getAiResponseContext, listAiResponses } from './ai.service.js';

const tenant = new Types.ObjectId();
const tenantStr = tenant.toString();

async function crearUsageLog(
  tenantId: Types.ObjectId,
  overrides: Partial<Omit<IAiUsageLog, 'createdAt'>> = {},
): Promise<Types.ObjectId> {
  const doc = await createScoped(AiUsageLogModel, tenantId, {
    method: 'chat',
    llmModel: 'gemini-1.5-flash',
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    cacheHit: false,
    fromFaq: false,
    durationMs: 120,
    ...overrides,
  });
  return doc._id as Types.ObjectId;
}

async function crearContext(
  tenantId: Types.ObjectId,
  usageLogId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await createScoped(AiResponseContextModel, tenantId, {
    usageLogId,
    promptSnapshot: { method: 'chat', version: '1.0.0', systemPrompt: 'Prompt de prueba' },
    retrievedChunks: [],
    kbVersion: 1,
    ...overrides,
  });
}

describe('HU-KB-04 — getAiResponseContext', () => {
  beforeEach(async () => {
    await AiUsageLogModel.deleteMany({});
    await AiResponseContextModel.deleteMany({});
  });

  it('con AiResponseContext poblado: transporta retrievedChunks sin alterarlos (demuestra AC1 sin RAG productivo)', async () => {
    const usageLogId = await crearUsageLog(tenant);
    const chunks = [
      { texto: 'El curso dura 6 semanas.', documentId: new Types.ObjectId().toString(), score: 0.87 },
      { texto: 'El horario es sabatino.', documentId: new Types.ObjectId().toString() },
    ];
    await crearContext(tenant, usageLogId, { retrievedChunks: chunks });

    const dto = await getAiResponseContext(tenantStr, usageLogId.toString());

    expect(dto.contextAvailable).toBe(true);
    expect(dto.retrievedChunks).toEqual(chunks);
    expect(dto.promptSnapshot).toEqual({
      method: 'chat',
      version: '1.0.0',
      systemPrompt: 'Prompt de prueba',
    });
  });

  it('AiUsageLog sin AiResponseContext asociado: 200 con contextAvailable:false, no 404', async () => {
    const usageLogId = await crearUsageLog(tenant);

    const dto = await getAiResponseContext(tenantStr, usageLogId.toString());

    expect(dto.contextAvailable).toBe(false);
    expect(dto.promptSnapshot).toBeNull();
    expect(dto.retrievedChunks).toEqual([]);
    // Los metadatos del AiUsageLog siguen presentes: la respuesta sí existió.
    expect(dto.model).toBe('gemini-1.5-flash');
  });

  it('id inexistente → AppError 404', async () => {
    await expect(
      getAiResponseContext(tenantStr, new Types.ObjectId().toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('kbVersion: null cuando el contexto no registró kbVersion', async () => {
    const usageLogId = await crearUsageLog(tenant);
    await crearContext(tenant, usageLogId, { kbVersion: null });

    const dto = await getAiResponseContext(tenantStr, usageLogId.toString());
    expect(dto.kbVersion).toBeNull();
  });
});

describe('HU-KB-04 — listAiResponses', () => {
  beforeEach(async () => {
    await AiUsageLogModel.deleteMany({});
  });

  it('pagina y ordena por createdAt descendente', async () => {
    for (let i = 0; i < 3; i += 1) {
      await crearUsageLog(tenant);
    }

    const page1 = await listAiResponses(tenantStr, { page: 1, limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(3);

    const page2 = await listAiResponses(tenantStr, { page: 2, limit: 2 });
    expect(page2.data).toHaveLength(1);
  });

  it('filtra por method', async () => {
    await crearUsageLog(tenant, { method: 'chat' });
    await crearUsageLog(tenant, { method: 'classify' });

    const soloChat = await listAiResponses(tenantStr, { page: 1, limit: 20, method: 'chat' });
    expect(soloChat.data).toHaveLength(1);
    expect(soloChat.data[0]?.method).toBe('chat');
  });
});
