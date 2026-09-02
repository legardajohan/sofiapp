import { Types } from 'mongoose';
import type { Redis } from 'ioredis';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { findOneScoped, createScoped } from '../../repositories/base.repository.js';
import { Tenant } from '../../features/tenant/tenant.model.js';
import { GeminiProvider } from '../../integrations/llm/gemini.provider.js';
import type { ILlmProvider } from '../../integrations/llm/llm-provider.types.js';
import { PromptTemplateModel, type IPromptTemplate } from './prompt-template.model.js';
import { AiUsageLogModel, type IAiUsageLog } from './ai-usage-log.model.js';
import { AiResponseContextModel, type IRetrievedChunk } from './ai-response-context.model.js';
import { buildCacheKey, getCached, setCached } from './ai-cache.util.js';
import { matchFaq } from '../../features/kb-faq/kb-faq.service.js';
import { searchKnowledge } from '../../features/kb/kb.retrieval.service.js';
import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import type {
  AiResult,
  AiChatParams,
  AiExtractParams,
  AiClassifyParams,
  AiSummarizeParams,
  ClassifyResult,
  FaqMatcher,
  KnowledgeRetriever,
  RetrievedChunk,
} from './ai-service.types.js';

/**
 * Tope del `motivo` de la clasificación (HU-IA-05). El texto acaba en `audit_events`, que no tiene
 * control de acceso por subrol, así que se recorta aquí además de pedirlo en la plantilla: lo que
 * el modelo devuelve no es una promesa, es una sugerencia.
 */
const MOTIVO_MAX_LEN = 240;

/** Sin matcher cableado, el servicio se comporta como antes de HU-KB-02. */
const noopFaqMatcher: FaqMatcher = async () => ({ matched: false });

/** Sin retriever cableado, el servicio se comporta como antes de HU-IA-01 (chat sin RAG). */
const noopRetriever: KnowledgeRetriever = async () => [];

/** Tono por defecto cuando ni el caller ni la plantilla del tenant definen uno. */
const TONO_POR_DEFECTO = 'profesional, claro y cercano';

/**
 * Envuelve los fragmentos recuperados en el bloque que lee el system prompt. El bloque se envía
 * SIEMPRE, incluso vacío: así el modelo ve explícitamente que no hay contexto y aplica la regla de
 * "no tengo información suficiente" que trae la plantilla, en vez de improvisar con su conocimiento
 * general. Los fragmentos van numerados solo para separarlos; la plantilla prohíbe citarlos.
 */
function construirBloqueContexto(chunks: RetrievedChunk[]): string {
  const cuerpo =
    chunks.length > 0
      ? chunks.map((c, i) => `--- Fragmento ${i + 1} ---\n${c.texto}`).join('\n\n')
      : '(sin información en la base de conocimiento para esta consulta)';
  return `\n\n--- CONTEXTO ---\n${cuerpo}\n--- FIN CONTEXTO ---`;
}

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
    private readonly faqMatcher: FaqMatcher = noopFaqMatcher,
    private readonly retriever: KnowledgeRetriever = noopRetriever,
  ) {}

  async chat(params: AiChatParams): Promise<AiResult<string>> {
    const start = Date.now();
    const template = await this.resolveTemplate(params.tenantId, 'chat');
    const kbVersion = await this.getTenantKbVersion(params.tenantId);
    // Pre-generado para poder enlazar AiResponseContext sin awaitear el insert de AiUsageLog
    // (HU-KB-04): ambas escrituras siguen siendo fire-and-forget, en paralelo.
    const usageLogId = new Types.ObjectId();
    const cacheVersion = `${template.version}:${kbVersion}`;
    const cacheInput = JSON.stringify({ historial: params.historial, tono: params.tono, instrucciones: params.instrucciones });
    const cacheKey = buildCacheKey(params.tenantId.toString(), 'chat', cacheInput, cacheVersion);

    const cached = await getCached<string>(this.redis, cacheKey);
    if (cached !== null) {
      this.logUsage({ _id: usageLogId, tenantId: params.tenantId, method: 'chat', llmModel: env.GEMINI_MODEL, promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHit: true, fromFaq: false, durationMs: Date.now() - start });
      this.writeResponseContext(usageLogId, params.tenantId, template, kbVersion, []);
      return { data: cached, cacheHit: true, fromFaq: false, retrievedChunks: [], promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: Date.now() - start };
    }

    // Cortocircuito por FAQ (HU-KB-02): va DESPUÉS de la caché exacta —que no cuesta ni
    // un embedding— y ANTES de generar. Si hay match, la respuesta es la que escribió el
    // admin, literal, con cero tokens de generación.
    const ultimaPregunta = [...params.historial].reverse().find((t) => t.role === 'user')?.content;
    if (ultimaPregunta) {
      const faq = await this.faqMatcher(params.tenantId, ultimaPregunta);
      if (faq.matched && faq.respuesta) {
        const durationMs = Date.now() - start;
        this.logUsage({ _id: usageLogId, tenantId: params.tenantId, method: 'chat', llmModel: env.GEMINI_MODEL, promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHit: true, fromFaq: true, durationMs });
        this.writeResponseContext(usageLogId, params.tenantId, template, kbVersion, []);
        return { data: faq.respuesta, cacheHit: true, fromFaq: true, retrievedChunks: [], promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs };
      }
    }

    // RAG (HU-IA-01): va DESPUÉS de la caché y del cortocircuito de FAQ —ambos responden sin gastar
    // un embedding— y ANTES de generar. Sin pregunta del cliente no hay nada que recuperar.
    const retrievedChunks = ultimaPregunta
      ? await this.retrieveKnowledge(params.tenantId, ultimaPregunta)
      : [];

    const { result: reply, usage } = await this.provider.generateReply({
      historial: params.historial,
      // El tono es corto y va SOLO aquí; las instrucciones y el contexto van SOLO en
      // `instrucciones`. `generateReply` compone `Tono: ${tono}. ${instrucciones}`: repetir el
      // mismo texto en ambos lo mete dos veces en el system prompt y cobra sus tokens dos veces
      // (el mismo bug que ya se corrigió en `summarize`).
      tono: params.tono ?? template.tono ?? TONO_POR_DEFECTO,
      instrucciones:
        (params.instrucciones ?? template.systemPrompt) + construirBloqueContexto(retrievedChunks),
    });

    await setCached(this.redis, cacheKey, reply, env.AI_CACHE_TTL_CHAT_S);
    const durationMs = Date.now() - start;
    this.logUsage({ _id: usageLogId, tenantId: params.tenantId, method: 'chat', llmModel: env.GEMINI_MODEL, ...usage, cacheHit: false, fromFaq: false, durationMs });
    this.writeResponseContext(usageLogId, params.tenantId, template, kbVersion, retrievedChunks);
    return { data: reply, cacheHit: false, fromFaq: false, retrievedChunks, ...usage, durationMs };
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

    const { result: raw, usage } = await this.provider.classifyLead({
      historial: params.historial,
      // HU-IA-05: hasta ahora `template` solo servía para versionar la cache key y el `systemPrompt`
      // sembrado no llegaba nunca al modelo.
      instrucciones: template.systemPrompt,
    });
    const classifyResult: ClassifyResult = {
      nivelInteres: raw.nivelInteres,
      objecion: raw.objecion ?? null,
      // `Number(x) || 0` cubre `undefined`, `null` y `NaN` de una vez, y ese 0 no alcanza ningún
      // umbral: ante una salida rara del modelo, el semáforo NO se toca. Es el default seguro.
      confianza: Math.min(1, Math.max(0, Number(raw.confianza) || 0)),
      motivo: (raw.motivo ?? '').trim().slice(0, MOTIVO_MAX_LEN),
    };
    await setCached(this.redis, cacheKey, classifyResult, env.AI_CACHE_TTL_CLASSIFY_S);
    const durationMs = Date.now() - start;
    this.logUsage({ tenantId: params.tenantId, method: 'classify', llmModel: env.GEMINI_MODEL, ...usage, cacheHit: false, fromFaq: false, durationMs });
    return { data: classifyResult, cacheHit: false, fromFaq: false, ...usage, durationMs };
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
    this.logUsage({ tenantId: params.tenantId, method: 'summary', llmModel: env.GEMINI_MODEL, ...usage, cacheHit: false, fromFaq: false, durationMs });
    return { data: result, cacheHit: false, ...usage, durationMs };
  }

  /**
   * Recupera el contexto de la KB degradando en vez de romper: si el proveedor de embeddings falla
   * o Atlas no responde, la conversación sigue con contexto vacío y el asistente admite que no
   * tiene información, que es preferible a devolverle un error al cliente en mitad del chat.
   * Mismo criterio que `matchFaq` (`kb-faq.service.ts`).
   */
  private async retrieveKnowledge(
    tenantId: Types.ObjectId,
    pregunta: string,
  ): Promise<RetrievedChunk[]> {
    try {
      return await this.retriever(tenantId, pregunta);
    } catch (err: unknown) {
      logger.warn('Falló la recuperación de contexto (RAG); se responde sin contexto', {
        tenantId: tenantId.toString(),
        error: String(err),
      });
      return [];
    }
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

  /**
   * `.lean()` no aplica el `default: 1` del schema a documentos que no tenían el campo en Mongo
   * (tenants creados antes de HU-KB-03): de ahí el `?? 1` explícito, sin confiar en el default.
   */
  private async getTenantKbVersion(tenantId: Types.ObjectId): Promise<number> {
    const tenant = await Tenant.findById(tenantId, { kbVersion: 1 }).lean<{ kbVersion?: number }>();
    return tenant?.kbVersion ?? 1;
  }

  private logUsage(log: Omit<IAiUsageLog, 'createdAt'> & { _id?: Types.ObjectId }): void {
    // fire-and-forget: no bloquea la respuesta al caller
    void createScoped(AiUsageLogModel, log.tenantId, log);
  }

  /**
   * Snapshot de auditoría (HU-KB-04): qué prompt, qué kbVersion y qué fragmentos de la KB
   * sustentaron una respuesta de `chat()`. Desde HU-IA-01 `retrievedChunks` llega poblado en la
   * rama generada; en las de caché y FAQ sigue llegando vacío **a propósito**, porque ahí no hubo
   * recuperación que auditar. Fire-and-forget, igual que `logUsage`: no bloquea al caller.
   */
  private writeResponseContext(
    usageLogId: Types.ObjectId,
    tenantId: Types.ObjectId,
    template: IPromptTemplate,
    kbVersion: number,
    retrievedChunks: IRetrievedChunk[],
  ): void {
    void createScoped(AiResponseContextModel, tenantId, {
      usageLogId,
      promptSnapshot: {
        method: template.method,
        version: template.version,
        systemPrompt: template.systemPrompt,
      },
      retrievedChunks,
      kbVersion,
    });
  }
}

export function createAIService(redis: Redis): AIService {
  // Único punto de cableado entre services/ai y los features (kb-faq y kb). `searchKnowledge`
  // encaja en `KnowledgeRetriever` sin adaptador: sus parámetros `k` y `provider` tienen valor
  // por defecto y `KbRetrievalResult` es estructuralmente un `RetrievedChunk`.
  return new AIService(new GeminiProvider(), redis, matchFaq, searchKnowledge);
}
