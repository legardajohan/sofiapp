import type { Types } from 'mongoose';
import { countScoped, findByIdScoped, findOneScoped, findScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { AiUsageLogModel } from '../../services/ai/ai-usage-log.model.js';
import { AiResponseContextModel } from '../../services/ai/ai-response-context.model.js';
import type {
  AiResponseContextDTO,
  AiResponseSummaryDTO,
  IAiResponseContextLean,
  IAiUsageLogLean,
  ListAiResponsesQuery,
  Paginated,
} from './ai.types.js';

type TenantId = string | Types.ObjectId;

function toSummaryDTO(log: IAiUsageLogLean): AiResponseSummaryDTO {
  return {
    id: String(log._id),
    method: log.method,
    model: log.llmModel,
    cacheHit: log.cacheHit,
    fromFaq: log.fromFaq,
    durationMs: log.durationMs,
    tokens: { prompt: log.promptTokens, completion: log.completionTokens, total: log.totalTokens },
    createdAt: log.createdAt.toISOString(),
  };
}

function toContextDTO(
  log: IAiUsageLogLean,
  context: IAiResponseContextLean | null,
): AiResponseContextDTO {
  return {
    ...toSummaryDTO(log),
    kbVersion: context?.kbVersion ?? null,
    promptSnapshot: context?.promptSnapshot ?? null,
    retrievedChunks: context?.retrievedChunks ?? [],
    contextAvailable: context !== null,
  };
}

export async function listAiResponses(
  tenantId: TenantId,
  query: ListAiResponsesQuery,
): Promise<Paginated<AiResponseSummaryDTO>> {
  const filter = query.method ? { method: query.method } : {};

  const [logs, total] = await Promise.all([
    findScoped(AiUsageLogModel, tenantId, filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean<IAiUsageLogLean[]>(),
    countScoped(AiUsageLogModel, tenantId, filter),
  ]);

  return { data: logs.map(toSummaryDTO), page: query.page, limit: query.limit, total };
}

/**
 * `usageLogId` inexistente o de otro tenant → 404. Nunca 403: distinguirlos confirmaría que la
 * respuesta existe en otra empresa (mismo criterio que `lead.service.ts`).
 *
 * `AiUsageLog` sin `AiResponseContext` asociado (registros previos a HU-KB-04, o escritura
 * fire-and-forget que aún no llegó) → 200 con `contextAvailable: false`, no 404: la respuesta sí
 * existió, solo no tiene trace guardado.
 */
export async function getAiResponseContext(
  tenantId: TenantId,
  usageLogId: string,
): Promise<AiResponseContextDTO> {
  const log = await findByIdScoped(AiUsageLogModel, tenantId, usageLogId).lean<IAiUsageLogLean>();
  if (!log) throw new AppError('Respuesta de IA no encontrada.', 404);

  const context = await findOneScoped(AiResponseContextModel, tenantId, {
    usageLogId: log._id,
  }).lean<IAiResponseContextLean>();

  return toContextDTO(log, context);
}
