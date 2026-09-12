import { Types } from 'mongoose';
import { findOneScoped, findOneAndUpdateScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import {
  PromptTemplateModel,
  type IPromptTemplate,
} from '../../services/ai/prompt-template.model.js';
import { getAIService } from '../../services/ai/ai-service.singleton.js';
import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import type {
  AiAnswerResponseDTO,
  AssistantConfigDTO,
  UpdateAssistantDTO,
} from './ai.types.js';

/** Tono que se muestra en el panel cuando la plantilla vigente no define ninguno. */
const TONO_POR_DEFECTO = 'profesional, claro y cercano';

/**
 * Sube el último segmento de la versión (`1.0.0` → `1.0.1`). La versión forma parte de la clave de
 * caché de IA, así que subirla en cada guardado es lo que impide que un cambio de prompt siga
 * sirviendo respuestas generadas con el prompt anterior. Partir de la versión heredada garantiza,
 * además, que la primera plantilla propia de un tenant nunca coincida con la de la global.
 */
function bumpVersion(actual: string): string {
  const partes = actual.split('.');
  const ultimo = Number(partes[partes.length - 1]);
  if (partes.length === 0 || Number.isNaN(ultimo)) return `${actual}.1`;
  partes[partes.length - 1] = String(ultimo + 1);
  return partes.join('.');
}

function toConfigDTO(tpl: IPromptTemplate, heredado: boolean): AssistantConfigDTO {
  return {
    tono: tpl.tono ?? TONO_POR_DEFECTO,
    systemPrompt: tpl.systemPrompt,
    heredado,
    version: tpl.version,
  };
}

/**
 * Plantilla `chat` vigente para el tenant: la suya si la tiene, si no la global.
 *
 * La global vive con `tenantId: null` y se lee fuera del repositorio scoped: es la misma excepción
 * documentada que usa `AIService.resolveTemplate` (análoga al login). No expone datos de ningún
 * tenant — es la plantilla de fábrica del producto.
 */
async function resolveChatTemplate(
  tenantId: string,
): Promise<{ tpl: IPromptTemplate; heredado: boolean }> {
  const propia = await findOneScoped(PromptTemplateModel, tenantId, {
    method: 'chat',
    isActive: true,
  })
    .lean<IPromptTemplate>()
    .exec();
  if (propia) return { tpl: propia, heredado: false };

  const global = await PromptTemplateModel.findOne({
    tenantId: null,
    method: 'chat',
    isActive: true,
  })
    .lean<IPromptTemplate>()
    .exec();
  if (global) return { tpl: global, heredado: true };

  throw new AppError(
    'No hay plantilla de chat configurada. Contacta al administrador de la plataforma.',
    500,
  );
}

export async function getAssistantConfig(tenantId: string): Promise<AssistantConfigDTO> {
  const { tpl, heredado } = await resolveChatTemplate(tenantId);
  return toConfigDTO(tpl, heredado);
}

/**
 * Crea o actualiza la plantilla `chat` **del tenant**. Nunca toca la global: el filtro del
 * `findOneAndUpdateScoped` lleva el `tenantId` del token, así que el upsert solo puede alcanzar
 * (o crear) el documento de esa empresa.
 */
export async function updateAssistantConfig(
  tenantId: string,
  dto: UpdateAssistantDTO,
): Promise<AssistantConfigDTO> {
  const { tpl } = await resolveChatTemplate(tenantId);

  const actualizada = await findOneAndUpdateScoped(
    PromptTemplateModel,
    tenantId,
    { method: 'chat', isActive: true },
    {
      $set: {
        tono: dto.tono,
        systemPrompt: dto.systemPrompt,
        version: bumpVersion(tpl.version),
        isActive: true,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean<IPromptTemplate>();

  if (!actualizada) {
    throw new AppError('No se pudo guardar la configuración del asistente.', 500);
  }
  return toConfigDTO(actualizada, false);
}

/**
 * Puerta HTTP al chatbot (`POST /api/ai/answer`): responde una pregunta suelta con RAG sobre la KB
 * del tenant. Pensada para probar y depurar el asistente desde el panel o desde una integración;
 * el auto-reply real de WhatsApp llama a `AIService.chat()` dentro del worker, sin salto HTTP.
 */
export async function answerQuestion(
  tenantId: string,
  mensaje: string,
): Promise<AiAnswerResponseDTO> {
  const historial: ChatTurn[] = [{ role: 'user', content: mensaje }];
  const resultado = await getAIService().chat({
    tenantId: new Types.ObjectId(tenantId),
    historial,
  });

  return {
    respuesta: resultado.data,
    fromFaq: resultado.fromFaq ?? false,
    cacheHit: resultado.cacheHit,
    chunksUsados: resultado.retrievedChunks?.length ?? 0,
  };
}
