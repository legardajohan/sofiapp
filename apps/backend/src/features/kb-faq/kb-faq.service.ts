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
import { evaluarSenales, umbralesDesdeEnv } from './kb-faq.matching.js';
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

type AccionQueReduce = 'desactivar' | 'eliminar';

const minimoActivasMsg = (minimo: number, accion: AccionQueReduce): string =>
  `Sofi necesita al menos ${minimo} preguntas frecuentes activas. ` +
  `Activa otra antes de ${accion === 'desactivar' ? 'apagar' : 'eliminar'} esta.`;

/**
 * Piso duro del número de FAQs activas (HU-KB-02-V3): la baja solo se permite si por encima del
 * mínimo queda margen. Con `minimo` en 0 la regla no existe.
 *
 * Un tenant que ya está por debajo (datos previos) queda igualmente bloqueado para bajar más, y
 * **no queda atrapado**: crear y editar el texto nunca pasan por aquí, así que una FAQ equivocada
 * se reescribe en el sitio y al mínimo se sube escribiendo.
 *
 * Pura a propósito: se verifica exhaustivamente sin Mongo y sin depender del valor del entorno.
 */
export function puedeReducirActivas(activas: number, minimo: number): boolean {
  return minimo === 0 || activas > minimo;
}

/** Guarda previa a toda operación que reduce el número de FAQs activas del tenant. */
async function asegurarMinimoActivas(
  tenantId: TenantId,
  accion: AccionQueReduce,
): Promise<void> {
  const minimo = env.FAQ_MIN_ACTIVAS;
  if (minimo === 0) return; // regla desactivada: ni siquiera se cuenta

  const activas = await countScoped(KbFaq, tenantId, { activo: true }).exec();
  if (puedeReducirActivas(activas, minimo)) return;

  // `details` viaja junto al mensaje para que la UI diga cuántas faltan sin volver a preguntar
  // (mismo patrón que el `leadId` del 409 de HU-CRM-01; ver docs/api-contract.md §4).
  throw new AppError(minimoActivasMsg(minimo, accion), 409, { activas, minimo });
}

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

  const [faqs, total, activas] = await Promise.all([
    findScoped(KbFaq, tenantId, filtro)
      .select('-embedding')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<LeanKbFaq[]>()
      .exec(),
    countScoped(KbFaq, tenantId, filtro).exec(),
    // Sin `filtro` a propósito: `activas` es del tenant entero, porque es el número contra el que
    // se compara el mínimo. Cuando el filtro ya es `activo: true` ambos coinciden, y está bien.
    countScoped(KbFaq, tenantId, { activo: true }).exec(),
  ]);

  return {
    data: faqs.map(mapKbFaqToResponse),
    total,
    page,
    limit,
    activas,
    minimoActivas: env.FAQ_MIN_ACTIVAS,
  };
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

  // Antes de re-embeber: si la operación se va a rechazar, no tiene sentido pagarle una llamada
  // a Gemini. Solo la transición true → false reduce el conteo; reactivar o reenviar `false` sobre
  // una ya inactiva no lo mueven.
  if (dto.activo === false && actual.activo) {
    await asegurarMinimoActivas(tenantId, 'desactivar');
  }

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
  const existing = await findByIdScoped(KbFaq, tenantId, id).lean<LeanKbFaq | null>().exec();
  if (!existing) throw new AppError(NO_ENCONTRADA, 404);

  // Borrar una FAQ ya apagada no mueve el conteo de activas, así que nunca se bloquea.
  if (existing.activo) await asegurarMinimoActivas(tenantId, 'eliminar');

  await findOneAndDeleteScoped(KbFaq, tenantId, { _id: id });
  return { deleted: true };
}

/**
 * Los dos mejores candidatos del tenant, ordenados por score descendente.
 *
 * Se reordena aquí en vez de confiar en el orden de salida de Atlas: con dos elementos
 * ordenar es gratis y elimina una suposición sobre la que descansaría la señal de margen.
 */
async function candidatosOrdenados(
  tenantId: TenantId,
  preguntaEntrante: string,
  provider: ILlmProvider,
): Promise<ScoredFaq[]> {
  const queryVector = await embedPregunta(preguntaEntrante, provider, 'RETRIEVAL_QUERY');
  const candidatos = await faqVectorSearchScoped(tenantId, queryVector);
  return [...candidatos].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/**
 * Cortocircuito del LLM. Es un OPTIMIZADOR, no un camino crítico: si Gemini o Atlas
 * fallan (p. ej. el índice vectorial aún no existe en el entorno), degrada a
 * `{ matched: false }` para que la conversación siga por el flujo normal (RAG + LLM).
 *
 * Decide con las tres señales de `kb-faq.matching` (HU-KB-02-V2), no solo con el score:
 * el coseno mide cercanía temática y por sí solo confunde "¿a qué hora abren?" con la FAQ
 * del precio. Un falso negativo aquí solo cuesta tokens —la pregunta sigue al RAG + LLM,
 * que la responde igual—; un falso positivo manda al prospecto una respuesta equivocada con
 * la firma de la empresa. Ante la duda, no se cortocircuita.
 */
export async function matchFaq(
  tenantId: TenantId,
  preguntaEntrante: string,
  provider: ILlmProvider = new GeminiProvider(),
): Promise<FaqMatchResult> {
  try {
    const [mejor, segundo] = await candidatosOrdenados(tenantId, preguntaEntrante, provider);
    if (!mejor || mejor.score === undefined) return { matched: false };

    const senales = evaluarSenales(
      preguntaEntrante,
      { pregunta: mejor.pregunta, score: mejor.score },
      segundo?.score,
      umbralesDesdeEnv(),
    );
    if (!senales.aprobado) return { matched: false };

    return { matched: true, respuesta: mejor.respuesta, confianza: mejor.score };
  } catch (err: unknown) {
    logger.warn('Fallo el matching de FAQ; se continúa con el flujo normal', {
      error: String(err),
    });
    return { matched: false };
  }
}

/**
 * Igual que `matchFaq` pero para el probador del admin: devuelve el mejor candidato
 * **aunque no supere las señales** y propaga los errores (aquí el admin sí quiere ver
 * qué está fallando). Solo lectura: no escribe nada ni afecta a las conversaciones.
 *
 * `matched` es el AND completo, es decir, exactamente lo que haría `matchFaq`; el desglose
 * de `senales` es lo que permite calibrar los tres mínimos con datos y no a ojo.
 */
export async function testFaq(
  tenantId: TenantId,
  preguntaEntrante: string,
  provider: ILlmProvider = new GeminiProvider(),
): Promise<FaqTestResult> {
  const umbrales = umbralesDesdeEnv();
  const minimos = {
    umbral: umbrales.umbral,
    margenMinimo: umbrales.margenMinimo,
    overlapMinimo: umbrales.overlapMinimo,
  };

  const [mejor, segundo] = await candidatosOrdenados(tenantId, preguntaEntrante, provider);
  if (!mejor || mejor.score === undefined) return { matched: false, ...minimos };

  const { aprobado, ...senales } = evaluarSenales(
    preguntaEntrante,
    { pregunta: mejor.pregunta, score: mejor.score },
    segundo?.score,
    umbrales,
  );

  return {
    matched: aprobado,
    respuesta: mejor.respuesta,
    confianza: mejor.score,
    ...minimos,
    faqId: mejor._id.toString(),
    pregunta: mejor.pregunta,
    segundaPregunta: segundo?.pregunta,
    senales,
  };
}
