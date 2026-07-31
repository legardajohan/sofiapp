import type { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import {
  findScoped,
  findOneScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findOneAndDeleteScoped,
  createScoped,
  countScoped,
} from '../../repositories/base.repository.js';
import { GeminiProvider } from '../../integrations/llm/gemini.provider.js';
import type { EmbedTaskType, ILlmProvider } from '../../integrations/llm/llm-provider.types.js';
import { KbFaq } from './kb-faq.model.js';
import { faqVectorSearchScoped, type ScoredFaq } from './kb-faq.repository.js';
import type {
  CreateFaqDTO,
  DeleteKbFaqResponse,
  FaqMatchResult,
  FaqTestResult,
  IKbFaqResponse,
  KbFaqsListResponse,
  LeanKbFaq,
  UpdateFaqDTO,
} from './kb-faq.types.js';

type TenantId = string | Types.ObjectId;

const DUPLICADA = 'Ya existe una pregunta frecuente con ese texto.';
const NO_ENCONTRADA = 'No se encontró la pregunta frecuente.';

/** El índice único {tenantId, pregunta} puede saltar por carrera pese al pre-chequeo. */
function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

async function embedPregunta(
  pregunta: string,
  provider: ILlmProvider,
  taskType: EmbedTaskType,
): Promise<number[]> {
  const { result } = await provider.embedTexts({ texts: [pregunta], taskType });
  const vector = result[0];
  if (!vector || vector.length === 0) {
    throw new AppError('No se pudo generar el vector de la pregunta.', 502);
  }
  return vector;
}

export function mapKbFaqToResponse(doc: LeanKbFaq): IKbFaqResponse {
  return {
    id: doc._id.toString(),
    pregunta: doc.pregunta,
    respuesta: doc.respuesta,
    activo: doc.activo,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

export async function listFaqs(
  tenantId: TenantId,
  page: number,
  limit: number,
  activo?: boolean,
): Promise<KbFaqsListResponse> {
  const filtro = activo === undefined ? {} : { activo };

  const [faqs, total] = await Promise.all([
    findScoped(KbFaq, tenantId, filtro)
      .select('-embedding')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<LeanKbFaq[]>()
      .exec(),
    countScoped(KbFaq, tenantId, filtro).exec(),
  ]);

  return { data: faqs.map(mapKbFaqToResponse), total, page, limit };
}

/**
 * Crea una FAQ y genera el embedding de su pregunta **de forma síncrona**: es un solo
 * texto corto, no justifica una cola (a diferencia del chunking de documentos KB).
 */
export async function createFaq(
  tenantId: TenantId,
  dto: CreateFaqDTO,
  provider: ILlmProvider = new GeminiProvider(),
): Promise<IKbFaqResponse> {
  const existing = await findOneScoped(KbFaq, tenantId, { pregunta: dto.pregunta })
    .lean<LeanKbFaq | null>()
    .exec();
  if (existing) throw new AppError(DUPLICADA, 409);

  const embedding = await embedPregunta(dto.pregunta, provider, 'RETRIEVAL_DOCUMENT');

  try {
    const created = await createScoped(KbFaq, tenantId, {
      pregunta: dto.pregunta,
      respuesta: dto.respuesta,
      embedding,
      activo: dto.activo ?? true,
    });
    return mapKbFaqToResponse(created.toObject() as LeanKbFaq);
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) throw new AppError(DUPLICADA, 409);
    throw err;
  }
}

/**
 * Actualiza una FAQ. El embedding solo se recalcula si cambia el TEXTO de la pregunta:
 * editar la respuesta o el interruptor de activo no gasta una llamada a Gemini.
 */
export async function updateFaq(
  tenantId: TenantId,
  id: string,
  dto: UpdateFaqDTO,
  provider: ILlmProvider = new GeminiProvider(),
): Promise<IKbFaqResponse> {
  const actual = await findByIdScoped(KbFaq, tenantId, id).lean<LeanKbFaq | null>().exec();
  if (!actual) throw new AppError(NO_ENCONTRADA, 404);

  const cambiaPregunta = dto.pregunta !== undefined && dto.pregunta !== actual.pregunta;

  const set: Record<string, unknown> = {};
  if (dto.respuesta !== undefined) set.respuesta = dto.respuesta;
  if (dto.activo !== undefined) set.activo = dto.activo;

  if (cambiaPregunta) {
    const pregunta = dto.pregunta as string;
    const colision = await findOneScoped(KbFaq, tenantId, { pregunta })
      .lean<LeanKbFaq | null>()
      .exec();
    if (colision) throw new AppError(DUPLICADA, 409);

    set.pregunta = pregunta;
    set.embedding = await embedPregunta(pregunta, provider, 'RETRIEVAL_DOCUMENT');
  }

  // Sin cambios reales (p. ej. reenvían la misma pregunta): devolvemos el estado actual.
  if (Object.keys(set).length === 0) return mapKbFaqToResponse(actual);

  try {
    const updated = await findOneAndUpdateScoped(
      KbFaq,
      tenantId,
      { _id: id },
      { $set: set },
      { new: true },
    )
      .lean<LeanKbFaq | null>()
      .exec();
    if (!updated) throw new AppError(NO_ENCONTRADA, 404);
    return mapKbFaqToResponse(updated);
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) throw new AppError(DUPLICADA, 409);
    throw err;
  }
}

export async function deleteFaq(
  tenantId: TenantId,
  id: string,
): Promise<DeleteKbFaqResponse> {
  const existing = await findByIdScoped(KbFaq, tenantId, id).lean().exec();
  if (!existing) throw new AppError(NO_ENCONTRADA, 404);

  await findOneAndDeleteScoped(KbFaq, tenantId, { _id: id });
  return { deleted: true };
}

/** Mejor candidato del tenant para una pregunta entrante, o `null` si no hay ninguno. */
async function mejorCandidato(
  tenantId: TenantId,
  preguntaEntrante: string,
  provider: ILlmProvider,
): Promise<ScoredFaq | null> {
  const queryVector = await embedPregunta(preguntaEntrante, provider, 'RETRIEVAL_QUERY');
  const [candidato] = await faqVectorSearchScoped(tenantId, queryVector);
  return candidato ?? null;
}

/**
 * Cortocircuito del LLM. Es un OPTIMIZADOR, no un camino crítico: si Gemini o Atlas
 * fallan (p. ej. el índice vectorial aún no existe en el entorno), degrada a
 * `{ matched: false }` para que la conversación siga por el flujo normal (RAG + LLM).
 */
export async function matchFaq(
  tenantId: TenantId,
  preguntaEntrante: string,
  provider: ILlmProvider = new GeminiProvider(),
): Promise<FaqMatchResult> {
  try {
    const candidato = await mejorCandidato(tenantId, preguntaEntrante, provider);
    const score = candidato?.score;
    if (!candidato || score === undefined || score < env.FAQ_MATCH_THRESHOLD) {
      return { matched: false };
    }
    return { matched: true, respuesta: candidato.respuesta, confianza: score };
  } catch (err: unknown) {
    logger.warn('Fallo el matching de FAQ; se continúa con el flujo normal', {
      error: String(err),
    });
    return { matched: false };
  }
}

/**
 * Igual que `matchFaq` pero para el probador del admin: devuelve el mejor candidato
 * **aunque no supere el umbral** y propaga los errores (aquí el admin sí quiere ver
 * qué está fallando). Solo lectura: no escribe nada ni afecta a las conversaciones.
 */
export async function testFaq(
  tenantId: TenantId,
  preguntaEntrante: string,
  provider: ILlmProvider = new GeminiProvider(),
): Promise<FaqTestResult> {
  const umbral = env.FAQ_MATCH_THRESHOLD;
  const candidato = await mejorCandidato(tenantId, preguntaEntrante, provider);
  const score = candidato?.score;

  if (!candidato || score === undefined) return { matched: false, umbral };

  return {
    matched: score >= umbral,
    respuesta: candidato.respuesta,
    confianza: score,
    umbral,
    faqId: candidato._id.toString(),
    pregunta: candidato.pregunta,
  };
}
