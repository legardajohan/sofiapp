import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { AIService } from './ai.service.js';
import type { ILlmProvider, ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import { PromptTemplateModel } from './prompt-template.model.js';
import { AiUsageLogModel, type IAiUsageLog } from './ai-usage-log.model.js';
import { AiResponseContextModel, type IAiResponseContext } from './ai-response-context.model.js';
import { Tenant } from '../../features/tenant/tenant.model.js';
import { findScoped, findOneScoped } from '../../repositories/base.repository.js';
import type { FaqMatcher, KnowledgeRetriever, RetrievedChunk } from './ai-service.types.js';

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
    classifyLead: vi.fn().mockResolvedValue({
      result: { nivelInteres: 'tibio', objecion: 'precio', confianza: 0.8, motivo: 'compara precios' },
      usage: USAGE,
    }),
    embedTexts: vi
      .fn()
      .mockResolvedValue({ result: [[0.1, 0.2, 0.3]], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }),
  };
}

const HISTORIAL: ChatTurn[] = [{ role: 'user', content: '¿Cuánto cuesta?' }];

async function createTenant(): Promise<Types.ObjectId> {
  const tenant = await Tenant.create({
    nombre: 'Tenant HU-KB-03',
    slug: `hukb03-${new Types.ObjectId().toString()}`,
    contacto: { email: 'hukb03@example.com', telefono: '3000000000' },
  });
  return tenant._id;
}

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

// ─── chat() · invalidación de caché por kbVersion (HU-KB-03) ─────────────────
describe('AIService.chat() — invalidación por Tenant.kbVersion (HU-KB-03)', () => {
  it('mismo kbVersion → la segunda llamada sigue siendo cache-hit', async () => {
    await seedGlobalTemplate('chat');
    const tenantId = await createTenant();
    const provider = makeProvider();
    const redisCache = new Map<string, string>();
    const service = new AIService(provider, makeRedisMock(redisCache));

    await service.chat({ tenantId, historial: HISTORIAL });
    const result2 = await service.chat({ tenantId, historial: HISTORIAL });

    expect(provider.generateReply).toHaveBeenCalledTimes(1);
    expect(result2.cacheHit).toBe(true);
  });

  it('bump de kbVersion entre llamadas → la caché anterior queda inalcanzable', async () => {
    await seedGlobalTemplate('chat');
    const tenantId = await createTenant();
    const provider = makeProvider();
    const redisCache = new Map<string, string>();
    const service = new AIService(provider, makeRedisMock(redisCache));

    await service.chat({ tenantId, historial: HISTORIAL });
    // Simula el bump que hace kb.service.ts al editar/borrar un documento.
    await Tenant.updateOne({ _id: tenantId }, { $inc: { kbVersion: 1 } });
    const result2 = await service.chat({ tenantId, historial: HISTORIAL });

    expect(provider.generateReply).toHaveBeenCalledTimes(2);
    expect(result2.cacheHit).toBe(false);
  });

  it('tenant sin campo kbVersion en Mongo (creado antes de HU-KB-03) no rompe chat()', async () => {
    await seedGlobalTemplate('chat');
    const tenantId = await createTenant();
    await Tenant.updateOne({ _id: tenantId }, { $unset: { kbVersion: 1 } });
    const provider = makeProvider();
    const service = new AIService(provider, makeRedisMock());

    const result = await service.chat({ tenantId, historial: HISTORIAL });

    expect(result.cacheHit).toBe(false);
    expect(result.data).toBe('Respuesta del modelo');
  });

  it('aislamiento: bump de kbVersion en tenantA no invalida la caché de tenantB', async () => {
    await seedGlobalTemplate('chat');
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const provider = makeProvider();
    const redisCache = new Map<string, string>();
    const service = new AIService(provider, makeRedisMock(redisCache));

    await service.chat({ tenantId: tenantA, historial: HISTORIAL });
    await service.chat({ tenantId: tenantB, historial: HISTORIAL });
    await Tenant.updateOne({ _id: tenantA }, { $inc: { kbVersion: 1 } });

    const resultB = await service.chat({ tenantId: tenantB, historial: HISTORIAL });

    expect(resultB.cacheHit).toBe(true);
    expect(provider.generateReply).toHaveBeenCalledTimes(2); // solo las 2 llamadas iniciales
  });
});

// ─── chat() · RAG sobre la KB (HU-IA-01) ──────────────────────────────────────
describe('AIService.chat() — RAG sobre la KB (HU-IA-01)', () => {
  let tenantId: Types.ObjectId;
  beforeEach(() => { tenantId = new Types.ObjectId(); });

  /** Matcher explícito "sin match" para llegar al 4º parámetro del constructor. */
  const noopMatcher: FaqMatcher = async () => ({ matched: false });

  /** `writeResponseContext` es fire-and-forget: hay que darle un tick antes de leer Mongo. */
  const esperarEscrituraDiferida = (): Promise<unknown> =>
    new Promise((r) => setTimeout(r, 50));

  const CHUNKS: RetrievedChunk[] = [
    { texto: 'El horario de atención es de 8:00 a 18:00.', documentId: 'doc-1', score: 0.91 },
    { texto: 'Los domingos permanecemos cerrados.', documentId: 'doc-1', score: 0.83 },
  ];

  /** Último `instrucciones` con el que se invocó a `generateReply`. */
  function instruccionesDe(provider: ILlmProvider): string {
    const mock = provider.generateReply as unknown as { mock: { calls: Array<[{ instrucciones: string }]> } };
    return mock.mock.calls[0]![0].instrucciones;
  }

  function tonoDe(provider: ILlmProvider): string {
    const mock = provider.generateReply as unknown as { mock: { calls: Array<[{ tono: string }]> } };
    return mock.mock.calls[0]![0].tono;
  }

  it('con chunks recuperados: el contexto llega en `instrucciones`', async () => {
    await seedGlobalTemplate('chat');
    const provider = makeProvider();
    const retriever: KnowledgeRetriever = vi.fn().mockResolvedValue(CHUNKS);
    const service = new AIService(provider, makeRedisMock(), noopMatcher, retriever);

    await service.chat({ tenantId, historial: HISTORIAL });

    const instrucciones = instruccionesDe(provider);
    expect(instrucciones).toContain('El horario de atención es de 8:00 a 18:00.');
    expect(instrucciones).toContain('Los domingos permanecemos cerrados.');
    expect(instrucciones).toContain('--- CONTEXTO ---');
  });

  it('recibe la última pregunta del cliente como consulta de recuperación', async () => {
    await seedGlobalTemplate('chat');
    const retriever: KnowledgeRetriever = vi.fn().mockResolvedValue(CHUNKS);
    const service = new AIService(makeProvider(), makeRedisMock(), noopMatcher, retriever);

    await service.chat({ tenantId, historial: HISTORIAL });

    expect(retriever).toHaveBeenCalledWith(tenantId, '¿Cuánto cuesta?');
  });

  it('sin chunks: marca el contexto como vacío en vez de omitir el bloque', async () => {
    await seedGlobalTemplate('chat');
    const provider = makeProvider();
    const retriever: KnowledgeRetriever = vi.fn().mockResolvedValue([]);
    const service = new AIService(provider, makeRedisMock(), noopMatcher, retriever);

    await service.chat({ tenantId, historial: HISTORIAL });

    const instrucciones = instruccionesDe(provider);
    expect(instrucciones).toContain('--- CONTEXTO ---');
    expect(instrucciones).toContain('sin información en la base de conocimiento');
  });

  it('el contexto NO se duplica en `tono`: generateReply compone `Tono: X. Y`', async () => {
    await seedGlobalTemplate('chat');
    const provider = makeProvider();
    const retriever: KnowledgeRetriever = vi.fn().mockResolvedValue(CHUNKS);
    const service = new AIService(provider, makeRedisMock(), noopMatcher, retriever);

    await service.chat({ tenantId, historial: HISTORIAL });

    const tono = tonoDe(provider);
    expect(tono).not.toContain('--- CONTEXTO ---');
    expect(tono).not.toContain('El horario de atención es de 8:00 a 18:00.');
    // Y tampoco el system prompt, que es lo que duplicaba el bug previo a HU-IA-01.
    expect(tono).not.toContain('Plantilla global de prueba para chat');
  });

  it('usa el `tono` de la plantilla del tenant cuando lo define', async () => {
    await PromptTemplateModel.create({
      tenantId,
      method: 'chat',
      version: '2.0.0',
      isActive: true,
      systemPrompt: 'Instrucciones propias del tenant',
      tono: 'informal y juvenil',
    });
    const provider = makeProvider();
    const service = new AIService(provider, makeRedisMock(), noopMatcher, async () => []);

    await service.chat({ tenantId, historial: HISTORIAL });

    expect(tonoDe(provider)).toBe('informal y juvenil');
  });

  it('sin `tono` en la plantilla, cae al tono por defecto del código', async () => {
    await seedGlobalTemplate('chat');
    const provider = makeProvider();
    const service = new AIService(provider, makeRedisMock(), noopMatcher, async () => []);

    await service.chat({ tenantId, historial: HISTORIAL });

    expect(tonoDe(provider)).toBe('profesional, claro y cercano');
  });

  it('cache hit: no se recupera nada (el RAG va después de la caché)', async () => {
    await seedGlobalTemplate('chat');
    const retriever: KnowledgeRetriever = vi.fn().mockResolvedValue(CHUNKS);
    const redisCache = new Map<string, string>();
    const service = new AIService(makeProvider(), makeRedisMock(redisCache), noopMatcher, retriever);

    await service.chat({ tenantId, historial: HISTORIAL });
    const segunda = await service.chat({ tenantId, historial: HISTORIAL });

    expect(segunda.cacheHit).toBe(true);
    expect(retriever).toHaveBeenCalledTimes(1); // solo la primera, la que sí generó
    expect(segunda.retrievedChunks).toEqual([]);
  });

  it('match de FAQ: no se recupera nada (el RAG va después del cortocircuito)', async () => {
    await seedGlobalTemplate('chat');
    const retriever: KnowledgeRetriever = vi.fn().mockResolvedValue(CHUNKS);
    const matcher: FaqMatcher = async () => ({ matched: true, respuesta: 'Respuesta literal de FAQ' });
    const service = new AIService(makeProvider(), makeRedisMock(), matcher, retriever);

    const result = await service.chat({ tenantId, historial: HISTORIAL });

    expect(result.fromFaq).toBe(true);
    expect(retriever).not.toHaveBeenCalled();
    expect(result.retrievedChunks).toEqual([]);
  });

  it('si la recuperación falla, responde igual con contexto vacío en vez de romper el chat', async () => {
    await seedGlobalTemplate('chat');
    const provider = makeProvider();
    const retriever: KnowledgeRetriever = vi.fn().mockRejectedValue(new Error('Atlas caído'));
    const service = new AIService(provider, makeRedisMock(), noopMatcher, retriever);

    const result = await service.chat({ tenantId, historial: HISTORIAL });

    expect(result.data).toBe('Respuesta del modelo');
    expect(result.retrievedChunks).toEqual([]);
    expect(instruccionesDe(provider)).toContain('sin información en la base de conocimiento');
  });

  it('sin retriever cableado, el comportamiento previo a HU-IA-01 se mantiene', async () => {
    await seedGlobalTemplate('chat');
    const provider = makeProvider();
    const service = new AIService(provider, makeRedisMock());

    const result = await service.chat({ tenantId, historial: HISTORIAL });

    expect(result.data).toBe('Respuesta del modelo');
    expect(result.retrievedChunks).toEqual([]);
  });

  it('los chunks usados quedan auditados en AiResponseContext', async () => {
    await seedGlobalTemplate('chat');
    const retriever: KnowledgeRetriever = vi.fn().mockResolvedValue(CHUNKS);
    const service = new AIService(makeProvider(), makeRedisMock(), noopMatcher, retriever);

    await service.chat({ tenantId, historial: HISTORIAL });
    await esperarEscrituraDiferida();

    const ctx = await findOneScoped(AiResponseContextModel, tenantId, {})
      .lean<IAiResponseContext>()
      .exec();
    expect(ctx?.retrievedChunks).toHaveLength(2);
    expect(ctx?.retrievedChunks[0]?.texto).toBe('El horario de atención es de 8:00 a 18:00.');
    expect(ctx?.retrievedChunks[0]?.documentId).toBe('doc-1');
  });
});

// ─── chat() · AiResponseContext (HU-KB-04) ────────────────────────────────────
describe('AIService.chat() — AiResponseContext (HU-KB-04)', () => {
  let tenantId: Types.ObjectId;
  beforeEach(() => { tenantId = new Types.ObjectId(); });

  it('en generación real: crea un AiResponseContext enlazado al AiUsageLog de la misma llamada', async () => {
    await seedGlobalTemplate('chat');
    const service = new AIService(makeProvider(), makeRedisMock());

    await service.chat({ tenantId, historial: HISTORIAL });
    await new Promise((r) => setTimeout(r, 50));

    const logs = await findScoped(AiUsageLogModel, tenantId)
      .lean<(IAiUsageLog & { _id: Types.ObjectId })[]>()
      .exec();
    expect(logs).toHaveLength(1);

    const contexts = await findScoped(AiResponseContextModel, tenantId)
      .lean<IAiResponseContext[]>()
      .exec();
    expect(contexts).toHaveLength(1);
    expect(String(contexts[0]?.usageLogId)).toBe(String(logs[0]?._id));
    expect(contexts[0]?.promptSnapshot).toEqual({
      method: 'chat',
      version: '1.0.0',
      systemPrompt: 'Plantilla global de prueba para chat',
    });
    expect(contexts[0]?.retrievedChunks).toEqual([]);
  });

  it('en un hit de caché exacta: también crea su propio AiResponseContext', async () => {
    await seedGlobalTemplate('chat');
    const redisCache = new Map<string, string>();
    const service = new AIService(makeProvider(), makeRedisMock(redisCache));

    await service.chat({ tenantId, historial: HISTORIAL });
    await service.chat({ tenantId, historial: HISTORIAL });
    await new Promise((r) => setTimeout(r, 50));

    const contexts = await findScoped(AiResponseContextModel, tenantId)
      .lean<IAiResponseContext[]>()
      .exec();
    expect(contexts).toHaveLength(2);
  });

  it('en un hit de FAQ: crea su AiResponseContext con retrievedChunks vacío', async () => {
    await seedGlobalTemplate('chat');
    const matcher: FaqMatcher = vi
      .fn()
      .mockResolvedValue({ matched: true, respuesta: 'Respuesta de FAQ', confianza: 0.9 });
    const service = new AIService(makeProvider(), makeRedisMock(), matcher);

    await service.chat({ tenantId, historial: HISTORIAL });
    await new Promise((r) => setTimeout(r, 50));

    const contexts = await findScoped(AiResponseContextModel, tenantId)
      .lean<IAiResponseContext[]>()
      .exec();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.retrievedChunks).toEqual([]);
  });

  it('aislamiento: AiResponseContext de tenantA no es visible con findOneScoped de tenantB', async () => {
    await seedGlobalTemplate('chat');
    const tenantB = new Types.ObjectId();
    const service = new AIService(makeProvider(), makeRedisMock());

    await service.chat({ tenantId, historial: HISTORIAL });
    await new Promise((r) => setTimeout(r, 50));

    const contextA = await findOneScoped(AiResponseContextModel, tenantId).exec();
    expect(contextA).not.toBeNull();

    const contextFromB = await findOneScoped(AiResponseContextModel, tenantB, {
      usageLogId: contextA?.usageLogId,
    }).exec();
    expect(contextFromB).toBeNull();
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

  // HU-IA-05. Hasta entonces `classify()` resolvía la plantilla solo para versionar la clave de
  // caché y el `systemPrompt` no llegaba nunca al modelo: era texto muerto.
  it('pasa el systemPrompt de la plantilla como instrucciones (AC2)', async () => {
    const tenantId = new Types.ObjectId();
    await seedGlobalTemplate('classify');
    const provider = makeProvider();
    const service = new AIService(provider, makeRedisMock());

    await service.classify({ tenantId, historial: HISTORIAL });

    expect(provider.classifyLead).toHaveBeenCalledWith({
      historial: HISTORIAL,
      instrucciones: 'Plantilla global de prueba para classify',
    });
  });

  it('propaga confianza y motivo (AC1)', async () => {
    const tenantId = new Types.ObjectId();
    await seedGlobalTemplate('classify');
    const service = new AIService(makeProvider(), makeRedisMock());

    const { data } = await service.classify({ tenantId, historial: HISTORIAL });

    expect(data.confianza).toBe(0.8);
    expect(data.motivo).toBe('compara precios');
  });

  it('sanea una salida fuera de rango en vez de romper (AC1)', async () => {
    const tenantId = new Types.ObjectId();
    await seedGlobalTemplate('classify');
    const provider = makeProvider();
    // Confianza imposible y motivo larguísimo: lo que devuelve el modelo es una sugerencia, no una
    // promesa. `confianza` ausente cuenta como 0 y por tanto nunca alcanza el umbral.
    (provider.classifyLead as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { nivelInteres: 'frio', objecion: null, confianza: 1.4, motivo: 'x'.repeat(500) },
      usage: USAGE,
    });
    const service = new AIService(provider, makeRedisMock());

    const { data } = await service.classify({ tenantId, historial: HISTORIAL });

    expect(data.confianza).toBe(1);
    expect(data.motivo).toHaveLength(240);
  });

  it('confianza ausente o no numérica → 0, que no alcanza ningún umbral (AC1)', async () => {
    const tenantId = new Types.ObjectId();
    await seedGlobalTemplate('classify');
    const provider = makeProvider();
    (provider.classifyLead as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { nivelInteres: 'caliente', objecion: null },
      usage: USAGE,
    });
    const service = new AIService(provider, makeRedisMock());

    const { data } = await service.classify({ tenantId, historial: HISTORIAL });

    expect(data.confianza).toBe(0);
    expect(data.motivo).toBe('');
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
