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
import type {
  AiResult,
  AiChatParams,
  AiExtractParams,
  AiClassifyParams,
  ClassifyResult,
} from './ai-service.types.js';

export class AIService {
  constructor(
    private readonly provider: ILlmProvider,
    private readonly redis: Redis,
  ) {}

  async chat(params: AiChatParams): Promise<AiResult<string>> {
    const start = Date.now();
    const template = await this.resolveTemplate(params.tenantId, 'chat');
    const cacheInput = JSON.stringify({ historial: params.historial, tono: params.tono, instrucciones: params.instrucciones });
    const cacheKey = buildCacheKey(params.tenantId.toString(), 'chat', cacheInput, template.version);

    const cached = await getCached<string>(this.redis, cacheKey);
    if (cached !== null) {
      this.logUsage({ tenantId: params.tenantId, method: 'chat', llmModel: env.GEMINI_MODEL, promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHit: true, durationMs: Date.now() - start });
      return { data: cached, cacheHit: true, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: Date.now() - start };
    }

    const reply = await this.provider.generateReply({
      historial: params.historial,
      tono: params.tono ?? template.systemPrompt,
      instrucciones: params.instrucciones ?? template.systemPrompt,
    });

    await setCached(this.redis, cacheKey, reply, env.AI_CACHE_TTL_CHAT_S);
    const durationMs = Date.now() - start;
    this.logUsage({ tenantId: params.tenantId, method: 'chat', llmModel: env.GEMINI_MODEL, promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHit: false, durationMs });
    return { data: reply, cacheHit: false, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs };
  }

  async extract<T>(params: AiExtractParams): Promise<AiResult<T>> {
    const start = Date.now();
    await this.resolveTemplate(params.tenantId, 'extract');

    const result = await this.provider.extractSlots({
      historial: params.historial,
      camposObjetivo: params.camposObjetivo,
    });

    const parsed = params.schema.parse(result.slots) as T;
    const durationMs = Date.now() - start;
    this.logUsage({ tenantId: params.tenantId, method: 'extract', llmModel: env.GEMINI_MODEL, promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHit: false, durationMs });
    return { data: parsed, cacheHit: false, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs };
  }

  async classify(params: AiClassifyParams): Promise<AiResult<ClassifyResult>> {
    const start = Date.now();
    const template = await this.resolveTemplate(params.tenantId, 'classify');
    const cacheInput = JSON.stringify({ historial: params.historial });
    const cacheKey = buildCacheKey(params.tenantId.toString(), 'classify', cacheInput, template.version);

    const cached = await getCached<ClassifyResult>(this.redis, cacheKey);
    if (cached !== null) {
      this.logUsage({ tenantId: params.tenantId, method: 'classify', llmModel: env.GEMINI_MODEL, promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHit: true, durationMs: Date.now() - start });
      return { data: cached, cacheHit: true, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: Date.now() - start };
    }

    const classifyResult = await this.provider.classifyLead({ historial: params.historial });
    await setCached(this.redis, cacheKey, classifyResult, env.AI_CACHE_TTL_CLASSIFY_S);
    const durationMs = Date.now() - start;
    this.logUsage({ tenantId: params.tenantId, method: 'classify', llmModel: env.GEMINI_MODEL, promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHit: false, durationMs });
    return { data: classifyResult, cacheHit: false, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs };
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
  return new AIService(new GeminiProvider(), redis);
}
