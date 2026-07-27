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
import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import type {
  AiResult,
  AiChatParams,
  AiExtractParams,
  AiClassifyParams,
  AiSummarizeParams,
  ClassifyResult,
} from './ai-service.types.js';

/**
 * Gemini rechaza con `400 Requests ending with a model turn are not supported` cualquier petición
 * cuyo último turno sea del modelo. En chat nunca pasa (el último turno es el mensaje del cliente),
 * pero al resumir o extraer sobre un transcript cerrado por el asesor sí ocurre. Añadimos el
 * turno de usuario que formula la tarea: satisface la restricción y explicita la instrucción.
 */
function conTurnoDeTarea(historial: ChatTurn[], tarea: string): ChatTurn[] {
  return [...historial, { role: 'user', content: tarea }];
}

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

    const { result: reply, usage } = await this.provider.generateReply({
      historial: params.historial,
      tono: params.tono ?? template.systemPrompt,
      instrucciones: params.instrucciones ?? template.systemPrompt,
    });

    await setCached(this.redis, cacheKey, reply, env.AI_CACHE_TTL_CHAT_S);
    const durationMs = Date.now() - start;
    this.logUsage({ tenantId: params.tenantId, method: 'chat', llmModel: env.GEMINI_MODEL, ...usage, cacheHit: false, durationMs });
    return { data: reply, cacheHit: false, ...usage, durationMs };
  }

  async extract<T>(params: AiExtractParams): Promise<AiResult<T>> {
    const start = Date.now();
    await this.resolveTemplate(params.tenantId, 'extract');

    const { result, usage } = await this.provider.extractSlots({
      historial: conTurnoDeTarea(
        params.historial,
        'Extrae de la conversación anterior los campos solicitados. Deja vacío el que no aparezca.',
      ),
      camposObjetivo: params.camposObjetivo,
    });

    const parsed = params.schema.parse(result.slots) as T;
    const durationMs = Date.now() - start;
    this.logUsage({ tenantId: params.tenantId, method: 'extract', llmModel: env.GEMINI_MODEL, ...usage, cacheHit: false, durationMs });
    return { data: parsed, cacheHit: false, ...usage, durationMs };
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

    const { result: classifyResult, usage } = await this.provider.classifyLead({
      historial: params.historial,
    });
    await setCached(this.redis, cacheKey, classifyResult, env.AI_CACHE_TTL_CLASSIFY_S);
    const durationMs = Date.now() - start;
    this.logUsage({ tenantId: params.tenantId, method: 'classify', llmModel: env.GEMINI_MODEL, ...usage, cacheHit: false, durationMs });
    return { data: classifyResult, cacheHit: false, ...usage, durationMs };
  }

  /**
   * Resume la conversación (transcript en `historial`) usando la plantilla global/tenant `summary`.
   * No cachea en Redis: la persistencia del resumen vive en `Cliente.resumenIA` (HU-OMNI-03),
   * cuya invalidación se deriva de `ultimoMensajeAt`. Reutiliza `generateReply`.
   */
  async summarize(params: AiSummarizeParams): Promise<AiResult<string>> {
    const start = Date.now();
    const template = await this.resolveTemplate(params.tenantId, 'summary');

    const { result, usage } = await this.provider.generateReply({
      historial: conTurnoDeTarea(params.historial, 'Resume la conversación anterior.'),
      // `generateReply` compone `Tono: ${tono}. ${instrucciones}`. Pasar la plantilla en ambos
      // campos la duplicaba dentro del system prompt y cobraba sus tokens dos veces por resumen.
      tono: 'profesional, neutro y conciso',
      instrucciones: template.systemPrompt,
    });

    const durationMs = Date.now() - start;
    this.logUsage({ tenantId: params.tenantId, method: 'summary', llmModel: env.GEMINI_MODEL, ...usage, cacheHit: false, durationMs });
    return { data: result, cacheHit: false, ...usage, durationMs };
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
