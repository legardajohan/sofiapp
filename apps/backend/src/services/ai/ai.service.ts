import type { Types } from 'mongoose';
import type { Redis } from 'ioredis';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { findOneScoped, createScoped } from '../../repositories/base.repository.js';
import { GeminiProvider } from '../../integrations/llm/gemini.provider.js';
import type { ILlmProvider } from '../../integrations/llm/llm-provider.types.js';
import { PromptTemplateModel, type IPromptTemplate } from './prompt-template.model.js';
import { AiUsageLogModel, type IAiUsageLog } from './ai-usage-log.model.js';
import { buildCacheKey, getCached, setCached } from './ai-cache.util.js';
import { matchFaq } from '../../features/kb-faq/kb-faq.service.js';
import type {
  AiResult,
  AiChatParams,
  AiExtractParams,
  AiClassifyParams,
  ClassifyResult,
  FaqMatcher,
} from './ai-service.types.js';

/** Sin matcher cableado, el servicio se comporta como antes de HU-KB-02. */
const noopFaqMatcher: FaqMatcher = async () => ({ matched: false });

export class AIService {
  constructor(
    private readonly provider: ILlmProvider,
    private readonly redis: Redis,
    private readonly faqMatcher: FaqMatcher = noopFaqMatcher,
  ) {}

  async chat(params: AiChatParams): Promise<AiResult<string>> {
    const start = Date.now();
    const template = await this.resolveTemplate(params.tenantId, 'chat');
    const cacheInput = JSON.stringify({ historial: params.historial, tono: params.tono, instrucciones: params.instrucciones });
    const cacheKey = buildCacheKey(params.tenantId.toString(), 'chat', cacheInput, template.version);

    const cached = await getCached<string>(this.redis, cacheKey);
    if (cached !== null) {
      this.logUsage({ tenantId: params.tenantId, method: 'chat', llmModel: env.GEMINI_MODEL, promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHit: true, fromFaq: false, durationMs: Date.now() - start });
      return { data: cached, cacheHit: true, fromFaq: false, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: Date.now() - start };
    }

    // Cortocircuito por FAQ (HU-KB-02): va DESPUÉS de la caché exacta —que no cuesta ni
    // un embedding— y ANTES de generar. Si hay match, la respuesta es la que escribió el
    // admin, literal, con cero tokens de generación.
    const ultimaPregunta = [...params.historial].reverse().find((t) => t.role === 'user')?.content;
    if (ultimaPregunta) {
      const faq = await this.faqMatcher(params.tenantId, ultimaPregunta);
      if (faq.matched && faq.respuesta) {
        const durationMs = Date.now() - start;
        this.logUsage({ tenantId: params.tenantId, method: 'chat', llmModel: env.GEMINI_MODEL, promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHit: true, fromFaq: true, durationMs });
        return { data: faq.respuesta, cacheHit: true, fromFaq: true, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs };
      }
    }

    const { result: reply, usage } = await this.provider.generateReply({
      historial: params.historial,
      tono: params.tono ?? template.systemPrompt,
      instrucciones: params.instrucciones ?? template.systemPrompt,
    });

    await setCached(this.redis, cacheKey, reply, env.AI_CACHE_TTL_CHAT_S);
    const durationMs = Date.now() - start;
    this.logUsage({ tenantId: params.tenantId, method: 'chat', llmModel: env.GEMINI_MODEL, ...usage, cacheHit: false, fromFaq: false, durationMs });
    return { data: reply, cacheHit: false, fromFaq: false, ...usage, durationMs };
  }

  async extract<T>(params: AiExtractParams): Promise<AiResult<T>> {
    const start = Date.now();
    await this.resolveTemplate(params.tenantId, 'extract');

    const { result, usage } = await this.provider.extractSlots({
      historial: params.historial,
      camposObjetivo: params.camposObjetivo,
    });

    const parsed = params.schema.parse(result.slots) as T;
    const durationMs = Date.now() - start;
    this.logUsage({ tenantId: params.tenantId, method: 'extract', llmModel: env.GEMINI_MODEL, ...usage, cacheHit: false, fromFaq: false, durationMs });
    return { data: parsed, cacheHit: false, fromFaq: false, ...usage, durationMs };
  }

  async classify(params: AiClassifyParams): Promise<AiResult<ClassifyResult>> {
    const start = Date.now();
    const template = await this.resolveTemplate(params.tenantId, 'classify');
    const cacheInput = JSON.stringify({ historial: params.historial });
    const cacheKey = buildCacheKey(params.tenantId.toString(), 'classify', cacheInput, template.version);

    const cached = await getCached<ClassifyResult>(this.redis, cacheKey);
    if (cached !== null) {
      this.logUsage({ tenantId: params.tenantId, method: 'classify', llmModel: env.GEMINI_MODEL, promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHit: true, fromFaq: false, durationMs: Date.now() - start });
      return { data: cached, cacheHit: true, fromFaq: false, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: Date.now() - start };
    }

    const { result: classifyResult, usage } = await this.provider.classifyLead({
      historial: params.historial,
    });
    await setCached(this.redis, cacheKey, classifyResult, env.AI_CACHE_TTL_CLASSIFY_S);
    const durationMs = Date.now() - start;
    this.logUsage({ tenantId: params.tenantId, method: 'classify', llmModel: env.GEMINI_MODEL, ...usage, cacheHit: false, fromFaq: false, durationMs });
    return { data: classifyResult, cacheHit: false, fromFaq: false, ...usage, durationMs };
  }

  private async resolveTemplate(tenantId: Types.ObjectId, method: string): Promise<IPromptTemplate> {
    // Busca plantilla específica del tenant
    const tenantTpl = await findOneScoped(PromptTemplateModel, tenantId, {
      method,
      isActive: true,
    }).lean<IPromptTemplate>().exec();
    if (tenantTpl) return tenantTpl;

    // Excepción documentada: la plantilla global usa tenantId: null (análogo al login).
    const globalTpl = await PromptTemplateModel.findOne({ tenantId: null, method, isActive: true })
      .lean<IPromptTemplate>()
      .exec();
    if (globalTpl) return globalTpl;

    throw new AppError(`No hay plantilla activa para el método: ${method}`, 500);
  }

  private logUsage(log: Omit<IAiUsageLog, 'createdAt'>): void {
    // fire-and-forget: no bloquea la respuesta al caller
    void createScoped(AiUsageLogModel, log.tenantId, log);
  }
}

export function createAIService(redis: Redis): AIService {
  // Único punto de cableado entre services/ai y features/kb-faq.
  return new AIService(new GeminiProvider(), redis, matchFaq);
}
