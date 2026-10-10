import { Types } from 'mongoose';
import { findScoped } from '../../repositories/base.repository.js';
import { Message } from '../message/message.model.js';
import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';

/**
 * Cuántos mensajes recientes se le dan a Gemini como contexto conversacional. Suficiente para que
 * entienda de qué se viene hablando sin inflar el prompt (y su coste) en hilos largos; el
 * conocimiento de la empresa no sale de aquí, sale del RAG.
 */
const HISTORIAL_MAX = 10;

/**
 * Turnos escritos por el cliente. Los de rol `model` son de la empresa (bot o asesor) y no cuentan.
 *
 * Vive aquí y no dentro de un slice porque lo usan los dos servicios que el worker engancha al
 * final del ciclo de auto-reply —la semaforización (HU-IA-05) y la extracción (HU-IA-06)— para
 * decidir lo mismo: si la conversación tiene sustancia suficiente como para pagar una llamada al
 * modelo. Duplicarla haría que las dos guardas pudieran divergir sin que nadie se entere.
 */
export function turnosDelCliente(historial: ChatTurn[]): number {
  return historial.filter((t) => t.role === 'user').length;
}

/**
 * Últimos `HISTORIAL_MAX` mensajes en orden cronológico. Vive aquí desde HU-REP-03: además del
 * auto-reply lo usa el clasificador de tema cuando corre fuera del worker (backfill). Mismo mapeo
 * de roles que `generateConversationSummary`: lo que escribe el cliente es `user`; lo que sale de
 * la empresa (bot o asesor) es `model`.
 *
 * Los mensajes sin texto (imágenes, audios) se descartan en vez de traducirse a un placeholder: al
 * modelo no le aportan nada y solo gastarían tokens.
 */
export async function construirHistorial(tenantId: string, clienteId: string): Promise<ChatTurn[]> {
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
