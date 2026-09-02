import { Types } from 'mongoose';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';
import { findByIdScoped, findScoped } from '../repositories/base.repository.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { Message } from '../features/message/message.model.js';
import {
  handoffConversation,
  marcarParaAsesor,
  replyFromIa,
} from '../features/conversation/conversation.service.js';
import {
  evaluarAntesDeGenerar,
  evaluarDespuesDeGenerar,
  getHandoffSettings,
} from '../features/ai/ai-handoff.service.js';
import type { HandoffMotivo, HandoffSettingsDTO } from '../features/ai/ai-handoff.types.js';
import { getAIService } from '../services/ai/ai-service.singleton.js';
import type { AiResult } from '../services/ai/ai-service.types.js';
import type { ChatTurn } from '../integrations/llm/llm-provider.types.js';
import { clasificarYAplicarSemaforo } from '../features/ai/ai-semaforo.service.js';
import { MENSAJE_FALLO } from './ai-reply.messages.js';

/**
 * Cuántos mensajes recientes se le dan a Gemini como contexto conversacional. Suficiente para que
 * entienda de qué se viene hablando sin inflar el prompt (y su coste) en hilos largos; el
 * conocimiento de la empresa no sale de aquí, sale del RAG.
 */
const HISTORIAL_MAX = 10;

/**
 * El texto entrante NO viaja en el job: cuando se encola ya está persistido como `Message`, así que
 * sale del historial. Mandarlo aparte solo abriría la puerta a que job e hilo se desincronicen —y
 * con la agrupación de ráfagas de HU-IA-02 el job responde a *varios* mensajes, no a uno.
 *
 * `recibidoEn` es el instante del entrante que abrió la ventana, para poder medir la latencia
 * end-to-end que percibe el cliente.
 */
export interface AiReplyJobData {
  tenantId: string;
  clienteId: string;
  recibidoEn: number;
}

/**
 * Auto-reply de Sofi: recupera el hilo, genera la respuesta con RAG sobre la KB y la envía por el
 * mismo canal. Función pura respecto de BullMQ —el `Worker` se construye en `worker.ts`— para
 * poder testearla sin Redis.
 *
 * Devuelve el `historial` que llegó a usar, o `null` si no hubo nada que responder (Sofi apagada,
 * el último mensaje no es del cliente, hilo vacío). Lo devuelve **también cuando disparó un
 * handoff**: un handoff por intención de compra es justo el caso en que la conversación merece
 * subir su semáforo, y saltárselo dejaría fuera el escenario más valioso de HU-IA-05.
 */
async function ejecutarAutoReply(data: AiReplyJobData): Promise<ChatTurn[] | null> {
  const { tenantId, clienteId, recibidoEn } = data;
  const inicioProceso = Date.now();

  // Se re-chequea aquí y no solo al encolar: entre una cosa y otra un asesor pudo tomar el control
  // de la conversación, y entonces Sofi debe callarse.
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente?.iaHabilitada) return null;

  const historial = await construirHistorial(tenantId, clienteId);

  // Si lo último del hilo no es del cliente, la ráfaga ya quedó atendida: este job es el sobrante
  // de una ventana que se solapó con la anterior. Se sale sin gastar ni un embedding. La
  // comprobación es sobre el historial que ya se leyó, así que no añade consulta (HU-IA-02).
  const ultimo = historial[historial.length - 1];
  if (!ultimo || ultimo.role !== 'user') return null;

  // Se lee UNA vez y se reutiliza en los dos puntos de evaluación (HU-IA-03). Con la configuración
  // apagada —el estado de fábrica— `evaluarAntesDeGenerar` devuelve "no dispara" sin mirar nada,
  // así que el coste para quien no usa handoff es una consulta y cero cambios de comportamiento.
  const handoff = await getHandoffSettings(tenantId);

  // Punto 1: lo que se decide sin llamar al modelo. Si la conversación se va a una persona, generar
  // primero sería pagar un embedding y una generación para tirar la respuesta — y sumarle segundos
  // de espera a alguien que acaba de pedir hablar con un humano.
  const previa = evaluarAntesDeGenerar(handoff, ultimo.content);
  if (previa.dispara) {
    await ejecutarHandoff(tenantId, clienteId, handoff, previa.motivo, null);
    return historial;
  }

  let resultado: AiResult<string>;
  try {
    resultado = await getAIService().chat({ tenantId: new Types.ObjectId(tenantId), historial });
  } catch (err: unknown) {
    // El cliente no puede quedarse esperando por un fallo nuestro. Se le avisa y la conversación
    // sube a la bandeja para que la recoja una persona. No se relanza: con `attempts: 1` BullMQ
    // daría el job por fallido y el cliente seguiría sin saber nada.
    logger.error('Auto-reply: falló la generación', { tenantId, clienteId, error: String(err) });
    await avisarDeFalloYEscalar(tenantId, clienteId);
    return historial;
  }
  const finGeneracion = Date.now();

  // Punto 2: lo que solo se puede decidir con la respuesta delante (baja confianza, intención de
  // compra). Va aquí y no después de enviar: si hay handoff, lo que sale por WhatsApp cambia.
  const posterior = await evaluarDespuesDeGenerar(handoff, tenantId, historial, resultado);
  if (posterior.dispara) {
    await ejecutarHandoff(tenantId, clienteId, handoff, posterior.motivo, resultado.data);
    return historial;
  }

  try {
    await replyFromIa(tenantId, clienteId, resultado.data);
  } catch (err: unknown) {
    // Fuera de la ventana de 24 h o cuota de mensajes agotada: son condiciones esperables del
    // negocio, no un fallo del job. Propagarlas haría que BullMQ reintentase y volviese a pagar la
    // generación para fallar exactamente igual.
    if (err instanceof AppError) {
      logger.warn('Auto-reply no enviado', { tenantId, clienteId, motivo: err.message });
      return historial;
    }
    throw err;
  }

  // Las tres cifras por separado: sin esto no se puede saber si el "en segundos" que promete la
  // historia se rompe por la ventana de agrupación (nuestra, ajustable) o por la generación del
  // modelo (ajena). SLO declarado: p95 de `totalMs` < 30 s.
  logger.info('Auto-reply enviado', {
    tenantId,
    clienteId,
    esperaVentanaMs: inicioProceso - recibidoEn,
    generacionMs: finGeneracion - inicioProceso,
    totalMs: Date.now() - recibidoEn,
  });

  return historial;
}

/**
 * El job completo: responder y, después, clasificar la intención de compra (HU-IA-05).
 *
 * La clasificación va DESPUÉS de la decisión de handoff a propósito. Cuando la regla
 * `intentPurchase` está activa, `evaluarDespuesDeGenerar` ya llamó a `classify()` con este mismo
 * `historial`: misma clave de caché, así que la segunda llamada es un acierto y no cuesta nada.
 * Cuando no lo está, es una llamada extra por **ráfaga agrupada** (`AI_REPLY_WINDOW_MS`), no por
 * mensaje.
 *
 * Un único punto de enganche, en vez de repetirlo antes de cada uno de los seis `return` del ciclo.
 */
export async function processAiReplyJob(data: AiReplyJobData): Promise<void> {
  const historial = await ejecutarAutoReply(data);
  if (!historial) return;

  // No hace falta try/catch: `clasificarYAplicarSemaforo` no lanza nunca, por diseño — la respuesta
  // al cliente ya salió y un fallo del clasificador no puede dar el job por fallido.
  await clasificarYAplicarSemaforo(data.tenantId, data.clienteId, historial);
}

/**
 * Avisa al cliente y transfiere la conversación a una persona (HU-IA-03).
 *
 * Qué pasa con la respuesta generada depende del motivo, y **no es configurable a propósito**:
 *
 *  - Sin respuesta (disparó antes de generar): se manda solo el aviso.
 *  - `low_confidence`: la respuesta era "no tengo información suficiente". Repetírsela al cliente
 *    justo antes de decirle que lo transferimos es ruido, así que el aviso la SUSTITUYE.
 *  - `intent_purchase`: la respuesta sí le sirve —le contestamos lo que preguntó— y encima está
 *    comprando. Se ANEXA al aviso en UN SOLO mensaje de WhatsApp: mandar dos gastaría dos unidades
 *    de cuota y le llegarían como dos notificaciones seguidas para nada.
 *
 * El orden importa: primero se avisa, después se transfiere. Si el envío falla por ventana de 24 h
 * cerrada o cuota agotada, se transfiere IGUAL — ahí es justo cuando más falta hace que lo vea una
 * persona. Mismo criterio que `avisarDeFalloYEscalar`.
 */
async function ejecutarHandoff(
  tenantId: string,
  clienteId: string,
  settings: HandoffSettingsDTO,
  motivo: HandoffMotivo,
  respuestaGenerada: string | null,
): Promise<void> {
  const texto =
    motivo === 'intent_purchase' && respuestaGenerada
      ? `${respuestaGenerada}\n\n${settings.mensajeTransicion}`
      : settings.mensajeTransicion;

  try {
    await replyFromIa(tenantId, clienteId, texto);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      logger.warn('Aviso de handoff no enviado', { tenantId, clienteId, motivo: err.message });
    } else {
      throw err;
    }
  }

  await handoffConversation(tenantId, clienteId, motivo, settings.asesorDestinoId);
  logger.info('Handoff ejecutado', { tenantId, clienteId, motivo });
}

/**
 * Cierra el circuito cuando la IA no pudo responder: avisa al cliente y deja la conversación
 * visible para un asesor. El aviso puede fallar a su vez (fuera de ventana, cuota agotada) y aun
 * así hay que escalar — de hecho, ahí es cuando más falta hace que un humano lo vea.
 */
async function avisarDeFalloYEscalar(tenantId: string, clienteId: string): Promise<void> {
  try {
    await replyFromIa(tenantId, clienteId, MENSAJE_FALLO);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      logger.warn('Aviso de fallo no enviado', { tenantId, clienteId, motivo: err.message });
    } else {
      logger.error('Aviso de fallo: error inesperado', { tenantId, clienteId, error: String(err) });
    }
  }
  await marcarParaAsesor(tenantId, clienteId);
}

/**
 * Últimos `HISTORIAL_MAX` mensajes en orden cronológico. Mismo mapeo de roles que
 * `generateConversationSummary`: lo que escribe el cliente es `user`; lo que sale de la empresa
 * (bot o asesor) es `model`.
 *
 * Los mensajes sin texto (imágenes, audios) se descartan en vez de traducirse a un placeholder: al
 * modelo no le aportan nada y solo gastarían tokens.
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
