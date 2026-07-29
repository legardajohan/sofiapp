import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { AIService } from './ai.service.js';
import type { ILlmProvider, ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import { PromptTemplateModel } from './prompt-template.model.js';
import { AiUsageLogModel, type IAiUsageLog } from './ai-usage-log.model.js';
import { findScoped } from '../../repositories/base.repository.js';
import type { FaqMatcher } from './ai-service.types.js';

// Mongo en memoria provisto por tests/globalSetup.ts + tests/setup.ts (conexión global).

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
    embedTexts: vi
      .fn()
      .mockResolvedValue({ result: [[0.1, 0.2, 0.3]], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }),
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

  it('sin matcher cableado, el comportamiento previo a HU-KB-02 se mantiene', async () => {
    await seedGlobalTemplate('chat');
    const provider = makeProvider();
    const service = new AIService(provider, makeRedisMock());

    const result = await service.chat({ tenantId, historial: HISTORIAL });

    expect(provider.generateReply).toHaveBeenCalledTimes(1);
    expect(result.fromFaq).toBe(false);
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

// ─── chat() · cortocircuito por FAQ (HU-KB-02) ────────────────────────────────
describe('AIService.chat() — cortocircuito por FAQ', () => {
  let tenantId: Types.ObjectId;
  beforeEach(() => { tenantId = new Types.ObjectId(); });

  const RESPUESTA_FAQ = 'El curso cuesta $500.000 COP.';
  const matcherConMatch: FaqMatcher = vi
    .fn()
    .mockResolvedValue({ matched: true, respuesta: RESPUESTA_FAQ, confianza: 0.93 });
  const matcherSinMatch: FaqMatcher = vi.fn().mockResolvedValue({ matched: false });

  it('con match → NO invoca al modelo y devuelve la respuesta literal con cero tokens', async () => {
    await seedGlobalTemplate('chat');
    const provider = makeProvider();
    const service = new AIService(provider, makeRedisMock(), matcherConMatch);

    const result = await service.chat({ tenantId, historial: HISTORIAL });

    expect(provider.generateReply).not.toHaveBeenCalled();
    expect(result.data).toBe(RESPUESTA_FAQ);
    expect(result.fromFaq).toBe(true);
    expect(result.cacheHit).toBe(true);
    expect(result.totalTokens).toBe(0);
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
  });

  it('el matcher recibe el último turno del usuario, no todo el historial', async () => {
    await seedGlobalTemplate('chat');
    const matcher = vi.fn().mockResolvedValue({ matched: false });
    const service = new AIService(makeProvider(), makeRedisMock(), matcher);

    await service.chat({
      tenantId,
      historial: [
        { role: 'user', content: 'Hola' },
        { role: 'model', content: '¡Hola! ¿En qué te ayudo?' },
        { role: 'user', content: '¿Cuánto cuesta?' },
      ],
    });

    expect(matcher).toHaveBeenCalledWith(tenantId, '¿Cuánto cuesta?');
  });

  it('sin match → cae al flujo normal (RAG + LLM)', async () => {
    await seedGlobalTemplate('chat');
    const provider = makeProvider();
    const service = new AIService(provider, makeRedisMock(), matcherSinMatch);

    const result = await service.chat({ tenantId, historial: HISTORIAL });

    expect(provider.generateReply).toHaveBeenCalledTimes(1);
    expect(result.data).toBe('Respuesta del modelo');
    expect(result.fromFaq).toBe(false);
    expect(result.totalTokens).toBe(USAGE.totalTokens);
  });

  it('con hit de caché exacta, el matcher NO se llama (la caché es más barata)', async () => {
    await seedGlobalTemplate('chat');
    const matcher = vi.fn().mockResolvedValue({ matched: false });
    const redisCache = new Map<string, string>();
    const service = new AIService(makeProvider(), makeRedisMock(redisCache), matcher);

    await service.chat({ tenantId, historial: HISTORIAL }); // llena la caché
    matcher.mockClear();
    const result = await service.chat({ tenantId, historial: HISTORIAL });

    expect(result.cacheHit).toBe(true);
    expect(result.fromFaq).toBe(false);
    expect(matcher).not.toHaveBeenCalled();
  });

  it('historial sin turnos de usuario → el matcher no se llama y el flujo sigue normal', async () => {
    await seedGlobalTemplate('chat');
    const matcher = vi.fn().mockResolvedValue({ matched: false });
    const provider = makeProvider();
    const service = new AIService(provider, makeRedisMock(), matcher);

    const result = await service.chat({
      tenantId,
      historial: [{ role: 'model', content: '¿En qué te ayudo?' }],
    });

    expect(matcher).not.toHaveBeenCalled();
    expect(provider.generateReply).toHaveBeenCalledTimes(1);
    expect(result.fromFaq).toBe(false);
  });

  it('un match con `matched: true` pero sin respuesta no cortocircuita', async () => {
    await seedGlobalTemplate('chat');
    const provider = makeProvider();
    const matcher = vi.fn().mockResolvedValue({ matched: true, confianza: 0.9 });
    const service = new AIService(provider, makeRedisMock(), matcher);

    const result = await service.chat({ tenantId, historial: HISTORIAL });

    expect(provider.generateReply).toHaveBeenCalledTimes(1);
    expect(result.fromFaq).toBe(false);
  });

  it('registra el ahorro en AiUsageLog con fromFaq: true y tokens en cero', async () => {
    await seedGlobalTemplate('chat');
    const service = new AIService(makeProvider(), makeRedisMock(), matcherConMatch);

    await service.chat({ tenantId, historial: HISTORIAL });
    // Pequeña espera para que el fire-and-forget termine
    await new Promise((r) => setTimeout(r, 50));

    const logs = await findScoped(AiUsageLogModel, tenantId).lean<IAiUsageLog[]>().exec();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.fromFaq).toBe(true);
    expect(logs[0]?.totalTokens).toBe(0);
    expect(logs[0]?.method).toBe('chat');
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
