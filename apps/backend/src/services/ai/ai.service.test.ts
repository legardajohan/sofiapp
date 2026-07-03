import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { AIService } from './ai.service.js';
import type { ILlmProvider, ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import { PromptTemplateModel } from './prompt-template.model.js';
import { AiUsageLogModel } from './ai-usage-log.model.js';
import { findScoped } from '../../repositories/base.repository.js';

// ─── MongoDB in-memory ────────────────────────────────────────────────────────
let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await PromptTemplateModel.deleteMany({});
  await AiUsageLogModel.deleteMany({});
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function seedGlobalTemplate(method: 'chat' | 'extract' | 'classify'): Promise<void> {
  await PromptTemplateModel.create({
    tenantId: null,
    method,
    version: '1.0.0',
    isActive: true,
    systemPrompt: `Plantilla global de prueba para ${method}`,
  });
}

function makeRedisMock(cache: Map<string, string> = new Map()): Redis {
  return {
    get: vi.fn((key: string) => Promise.resolve(cache.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      cache.set(key, value);
      return Promise.resolve('OK');
    }),
  } as unknown as Redis;
}

const USAGE = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };

function makeProvider(): ILlmProvider {
  return {
    generateReply: vi.fn().mockResolvedValue({ result: 'Respuesta del modelo', usage: USAGE }),
    extractSlots: vi
      .fn()
      .mockResolvedValue({ result: { slots: { nombre: 'Juan' }, incompletos: [] }, usage: USAGE }),
    classifyLead: vi
      .fn()
      .mockResolvedValue({ result: { nivelInteres: 'tibio', objecion: 'precio' }, usage: USAGE }),
  };
}

const HISTORIAL: ChatTurn[] = [{ role: 'user', content: '¿Cuánto cuesta?' }];

// ─── chat() ───────────────────────────────────────────────────────────────────
describe('AIService.chat()', () => {
  let tenantId: Types.ObjectId;
  beforeEach(() => { tenantId = new Types.ObjectId(); });

  it('primer llamado → provider invocado, cacheHit: false', async () => {
    await seedGlobalTemplate('chat');
    const provider = makeProvider();
    const service = new AIService(provider, makeRedisMock());

    const result = await service.chat({ tenantId, historial: HISTORIAL });

    expect(provider.generateReply).toHaveBeenCalledTimes(1);
    expect(result.cacheHit).toBe(false);
    expect(result.data).toBe('Respuesta del modelo');
    expect(result.promptTokens).toBe(USAGE.promptTokens);
    expect(result.completionTokens).toBe(USAGE.completionTokens);
    expect(result.totalTokens).toBe(USAGE.totalTokens);
  });

  it('segundo llamado mismo input → provider NO invocado, cacheHit: true', async () => {
    await seedGlobalTemplate('chat');
    const provider = makeProvider();
    const redisCache = new Map<string, string>();
    const service = new AIService(provider, makeRedisMock(redisCache));

    await service.chat({ tenantId, historial: HISTORIAL });
    const result2 = await service.chat({ tenantId, historial: HISTORIAL });

    expect(provider.generateReply).toHaveBeenCalledTimes(1);
    expect(result2.cacheHit).toBe(true);
    expect(result2.data).toBe('Respuesta del modelo');
  });

  it('tenantId diferente → caché independiente', async () => {
    await seedGlobalTemplate('chat');
    const tenantB = new Types.ObjectId();
    const provider = makeProvider();
    const redisCache = new Map<string, string>();
    const service = new AIService(provider, makeRedisMock(redisCache));

    await service.chat({ tenantId, historial: HISTORIAL });
    await service.chat({ tenantId: tenantB, historial: HISTORIAL });

    // Ambos deben llamar al provider (caches independientes por tenantId)
    expect(provider.generateReply).toHaveBeenCalledTimes(2);
  });
});

// ─── classify() ───────────────────────────────────────────────────────────────
describe('AIService.classify()', () => {
  it('segundo llamado → cache hit', async () => {
    const tenantId = new Types.ObjectId();
    await seedGlobalTemplate('classify');
    const provider = makeProvider();
    const redisCache = new Map<string, string>();
    const service = new AIService(provider, makeRedisMock(redisCache));

    const r1 = await service.classify({ tenantId, historial: HISTORIAL });
    const r2 = await service.classify({ tenantId, historial: HISTORIAL });

    expect(r1.cacheHit).toBe(false);
    expect(r2.cacheHit).toBe(true);
    expect(provider.classifyLead).toHaveBeenCalledTimes(1);
  });
});

// ─── extract() ────────────────────────────────────────────────────────────────
describe('AIService.extract()', () => {
  it('siempre invoca al provider (sin caché)', async () => {
    const tenantId = new Types.ObjectId();
    await seedGlobalTemplate('extract');
    const provider = makeProvider();
    const service = new AIService(provider, makeRedisMock());
    const schema = z.object({ nombre: z.string() });

    await service.extract({ tenantId, historial: HISTORIAL, schema, camposObjetivo: [] });
    await service.extract({ tenantId, historial: HISTORIAL, schema, camposObjetivo: [] });

    expect(provider.extractSlots).toHaveBeenCalledTimes(2);
  });

  it('respuesta inválida vs. Zod schema → lanza ZodError', async () => {
    const tenantId = new Types.ObjectId();
    await seedGlobalTemplate('extract');
    const provider = makeProvider();
    vi.mocked(provider.extractSlots).mockResolvedValue({
      result: { slots: { nombre: 123 }, incompletos: [] },
      usage: USAGE,
    });
    const schema = z.object({ nombre: z.string() }); // 123 no es string
    const service = new AIService(provider, makeRedisMock());

    await expect(
      service.extract({ tenantId, historial: HISTORIAL, schema, camposObjetivo: [] }),
    ).rejects.toThrow();
  });
});

// ─── logUsage (aislamiento multi-tenant) ────────────────────────────────────
describe('AIService logUsage — aislamiento multi-tenant', () => {
  it('AiUsageLog de tenantA no visible con findScoped de tenantB', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    await seedGlobalTemplate('chat');
    const provider = makeProvider();
    const service = new AIService(provider, makeRedisMock());

    await service.chat({ tenantId: tenantA, historial: HISTORIAL });
    // Pequeña espera para que el fire-and-forget termine
    await new Promise((r) => setTimeout(r, 50));

    const logsB = await findScoped(AiUsageLogModel, tenantB).exec();
    expect(logsB).toHaveLength(0);

    const logsA = await findScoped(AiUsageLogModel, tenantA).exec();
    expect(logsA.length).toBeGreaterThan(0);
    expect(logsA[0]?.totalTokens).toBe(USAGE.totalTokens);
  });

  it('PromptTemplate específica de tenantA no visible para tenantB', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();

    await PromptTemplateModel.create({
      tenantId: tenantA,
      method: 'chat',
      version: '1.0.0',
      isActive: true,
      systemPrompt: 'Plantilla privada de tenantA',
    });

    const templateB = await findScoped(PromptTemplateModel, tenantB, {
      method: 'chat',
      isActive: true,
    }).exec();
    expect(templateB).toHaveLength(0);
  });
});
