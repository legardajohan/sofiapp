import { Types } from 'mongoose';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';
import { findByIdScoped, findScoped } from '../repositories/base.repository.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { Message } from '../features/message/message.model.js';
import { replyFromIa } from '../features/conversation/conversation.service.js';
import { getAIService } from '../services/ai/ai-service.singleton.js';
import type { ChatTurn } from '../integrations/llm/llm-provider.types.js';

/**
 * Cuántos mensajes recientes se le dan a Gemini como contexto conversacional. Suficiente para que
 * entienda de qué se viene hablando sin inflar el prompt (y su coste) en hilos largos; el
 * conocimiento de la empresa no sale de aquí, sale del RAG.
 */
const HISTORIAL_MAX = 10;

/**
 * El texto entrante NO viaja en el job: cuando se encola ya está persistido como `Message`, así que
 * sale del historial. Mandarlo aparte solo abriría la puerta a que job e hilo se desincronicen.
 */
export interface AiReplyJobData {
  tenantId: string;
  clienteId: string;
}

/**
 * Auto-reply de Sofi (HU-IA-01): recupera el hilo, genera la respuesta con RAG sobre la KB y la
 * envía por el mismo canal. Función pura respecto de BullMQ —el `Worker` se construye en
 * `worker.ts`— para poder testearla sin Redis.
 */
export async function processAiReplyJob(data: AiReplyJobData): Promise<void> {
  const { tenantId, clienteId } = data;

  // Se re-chequea aquí y no solo al encolar: entre una cosa y otra un asesor pudo tomar el control
  // de la conversación, y entonces Sofi debe callarse.
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente?.iaHabilitada) return;

  const historial = await construirHistorial(tenantId, clienteId);
  if (historial.length === 0) return;

  const { data: respuesta } = await getAIService().chat({
    tenantId: new Types.ObjectId(tenantId),
    historial,
  });

  try {
    await replyFromIa(tenantId, clienteId, respuesta);
  } catch (err: unknown) {
    // Fuera de la ventana de 24 h o cuota de mensajes agotada: son condiciones esperables del
    // negocio, no un fallo del job. Propagarlas haría que BullMQ reintentase y volviese a pagar la
    // generación para fallar exactamente igual.
    if (err instanceof AppError) {
      logger.warn('Auto-reply no enviado', { tenantId, clienteId, motivo: err.message });
      return;
    }
    throw err;
  }
}

/**
 * Últimos `HISTORIAL_MAX` mensajes en orden cronológico. Mismo mapeo de roles que
 * `generateConversationSummary`: lo que escribe el cliente es `user`; lo que sale de la empresa
 * (bot o asesor) es `model`.
 *
 * Los mensajes sin texto (imágenes, audios) se descartan en vez de traducirse a un placeholder: al
 * modelo no le aportan nada y solo gastarían tokens. El último turno es siempre el entrante que
 * disparó el job, así que nunca se cierra en un turno del modelo —que Gemini rechaza.
 */
async function construirHistorial(tenantId: string, clienteId: string): Promise<ChatTurn[]> {
  const docs = await findScoped(Message, tenantId, { clienteId: new Types.ObjectId(clienteId) })
    // `_id` desempata: dos mensajes del mismo milisegundo (habitual en ráfagas de WhatsApp)
    // ordenarían de forma arbitraria solo por `createdAt`, y el hilo llegaría descolocado.
    .sort({ createdAt: -1, _id: -1 })
    .limit(HISTORIAL_MAX)
    .lean();

  return docs
    .reverse()
    .filter((m) => !!m.texto)
    .map((m) => ({
      role: m.sender === 'user' ? 'user' : 'model',
      content: m.texto as string,
    }));
}
