import { Types } from 'mongoose';
import { AI_REPLY_JOB_NAME, aiReplyQueue } from '../config/queues.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';
import { findScoped } from '../repositories/base.repository.js';
import { resolveWebhookTenant } from '../features/webhook/webhook.service.js';
import { upsertByMetaUser } from '../features/cliente/cliente.service.js';
import { saveMessage, updateDeliveryStatus } from '../features/message/message.service.js';
import { notifyInboundMessage, replyFromIa } from '../features/conversation/conversation.service.js';
import { Message } from '../features/message/message.model.js';
import type { IMessageSource } from '../features/conversation/conversation.mapper.js';
import { parseDeliveryStatuses } from '../integrations/meta/meta-whatsapp.normalizer.js';
import type { IWhatsAppWebhookPayload } from '../features/webhook/webhook.types.js';
import type { TipoMensaje } from '../features/message/message.types.js';
import { MENSAJE_SOLO_TEXTO } from './ai-reply.messages.js';

export interface InboundJobData {
  tenantId: string;
  payload: IWhatsAppWebhookPayload;
}

function mapMsgType(type: string): TipoMensaje {
  const map: Record<string, TipoMensaje> = {
    text: 'text',
    image: 'image',
    audio: 'audio',
    document: 'document',
  };
  return map[type] ?? 'other';
}

/**
 * Identidad de la ventana de agrupación (HU-IA-02). Todos los mensajes de un mismo cliente que caen
 * en el mismo tramo de `AI_REPLY_WINDOW_MS` comparten `jobId`, y `Queue.add` con un `jobId` que ya
 * existe es un no-op: solo el primer mensaje de la ráfaga crea el job. Cuando ese job corre, lee el
 * hilo desde Mongo y ve la ráfaga entera, así que responde una vez a todo.
 *
 * Ventanas fijas y no deslizantes a propósito: reprogramar en cada mensaje exigiría
 * `getJob` + `remove` + `add` —tres viajes a Redis por mensaje— y competiría con el worker si el job
 * ya pasó a `active`. Lo que una ráfaga a caballo entre dos ventanas produce (dos jobs) lo resuelve
 * la guarda de `processAiReplyJob`, que no responde si lo último del hilo ya es del bot.
 *
 * El `tenantId` va por delante: dos clientes con el mismo `_id` en empresas distintas —imposible
 * hoy, pero gratis de blindar— nunca deben compartir ventana.
 *
 * **Sin `:` en el identificador.** BullMQ los rechaza en un `jobId` personalizado
 * (`Custom Id cannot contain :`, `job.js:1047-1050`). Tolera el caso de exactamente tres tramos por
 * compatibilidad con repeatable jobs antiguos, pero su propio código marca esa rama para
 * eliminarla, así que aquí no hay ninguno — no se trata de dejar tres, se trata de no dejar
 * ninguno. Con dos puntos, `aiReplyQueue.add` lanzaba y el auto-reply no se encolaba jamás: eso fue
 * HT-AI-02, y la suite entera pasaba porque el mock de la cola acepta cualquier id.
 *
 * El prefijo `ai-reply` es redundante con el nombre de la cola, pero garantiza que el id nunca sea
 * un entero puro, que es la otra regla de `validateOptions`.
 */
export function ventanaJobId(tenantId: string, clienteId: string, ahora: number): string {
  const ventana = Math.floor(ahora / env.AI_REPLY_WINDOW_MS);
  return `ai-reply-${tenantId}-${clienteId}-${ventana}`;
}

/**
 * Acusa recibo de un mensaje que Sofi todavía no sabe leer (audio, imagen, documento). El silencio
 * es peor que el acuse: el cliente no sabe si su mensaje llegó siquiera.
 *
 * Se manda **una sola vez** por racha: si lo último del hilo ya es este acuse, no se repite, para
 * que mandar tres notas de voz no devuelva tres veces la misma frase.
 */
async function acusarNoTexto(tenantId: string, clienteId: string): Promise<void> {
  // Se mira el último mensaje CON TEXTO, no el último a secas: el audio o la imagen que acaba de
  // llegar ya está guardado y sería siempre el último, así que preguntar por él no distinguiría
  // nada. Si lo último que se dijo con palabras fue este mismo acuse, el cliente ya lo leyó.
  // Y si escribió algo entre medias, su texto gana y el acuse vuelve a tener sentido.
  const [ultimoConTexto] = await findScoped(Message, tenantId, {
    clienteId: new Types.ObjectId(clienteId),
    texto: { $exists: true, $nin: [null, ''] },
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(1)
    .lean();

  if (ultimoConTexto?.texto === MENSAJE_SOLO_TEXTO) return;

  try {
    await replyFromIa(tenantId, clienteId, MENSAJE_SOLO_TEXTO);
  } catch (err: unknown) {
    // Fuera de la ventana de 24 h o cuota agotada. No puede tumbar la ingesta del mensaje, que ya
    // está guardado y notificado: el acuse es un extra, no el trabajo principal de este worker.
    if (err instanceof AppError) {
      logger.warn('Acuse de no-texto no enviado', { tenantId, clienteId, motivo: err.message });
      return;
    }
    throw err;
  }
}

/**
 * Ingesta de un webhook entrante de WhatsApp: persiste los mensajes, refresca la bandeja en vivo y
 * decide si Sofi debe responder. Función pura respecto de BullMQ —el `Worker` se construye en
 * `worker.ts`— para que la decisión de auto-responder se pueda testear sin Redis.
 */
export async function processInboundJob(data: InboundJobData): Promise<void> {
  const { payload } = data;

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      const phoneNumberId = value.metadata.phone_number_id;

      const integration = await resolveWebhookTenant(phoneNumberId);
      if (!integration) {
        logger.warn('phone_number_id sin tenant asociado', { phoneNumberId });
        continue;
      }

      const tenantId = integration.tenantId.toString();
      const tenantOid = new Types.ObjectId(tenantId);

      for (const msg of value.messages ?? []) {
        const contact = value.contacts?.find((c) => c.wa_id === msg.from);
        const nombre = contact?.profile.name;

        const cliente = await upsertByMetaUser(tenantId, msg.from, msg.from, 'whatsapp', nombre);
        const clienteId = cliente._id as Types.ObjectId;

        const saved = await saveMessage(tenantId, {
          tenantId: tenantOid,
          clienteId,
          canal: 'whatsapp',
          direccion: 'inbound',
          sender: 'user',
          tipo: mapMsgType(msg.type),
          texto: msg.text?.body,
          metaMessageId: msg.id,
          status: 'sent',
        });

        // Bandeja en vivo: sube el contador de no leídos y emite message:new al tenant.
        await notifyInboundMessage(tenantId, clienteId.toString(), saved as unknown as IMessageSource);

        if (cliente.iaHabilitada) {
          try {
            await atenderConSofi(tenantId, clienteId.toString(), msg.type, msg.text?.body);
          } catch (err: unknown) {
            // Que Sofi no arranque no deshace lo que ya pasó: el mensaje está guardado y en la
            // bandeja. Tumbar el job entero no recupera nada y ensucia la cola de fallidos
            // mezclando "no se ingestó" con "se ingestó y la IA no arrancó".
            // Nivel `error` a propósito: al no quedar el job en `failed`, este log es el único
            // rastro que queda. Fue la cola de fallidos la que permitió diagnosticar HT-AI-02.
            logger.error('Sofi no pudo atender el mensaje entrante', {
              tenantId,
              clienteId: clienteId.toString(),
              error: String(err),
            });
          }
        }
      }

      const statuses = parseDeliveryStatuses(value);
      for (const { metaMessageId, status } of statuses) {
        await updateDeliveryStatus(metaMessageId, status);
      }
    }
  }
}

/**
 * Qué hace Sofi con un mensaje entrante: encolar una respuesta si es texto, acusar recibo si no.
 * Nunca ignorarlo en silencio (HU-IA-02).
 */
async function atenderConSofi(
  tenantId: string,
  clienteId: string,
  tipo: string,
  texto: string | undefined,
): Promise<void> {
  if (tipo !== 'text' || !texto) {
    await acusarNoTexto(tenantId, clienteId);
    return;
  }

  const ahora = Date.now();
  // En cola aparte: generar y enviar es lento y puede fallar, y no debe arrastrar consigo la
  // ingesta del mensaje, que ya está hecha.
  await aiReplyQueue.add(
    AI_REPLY_JOB_NAME,
    { tenantId, clienteId, recibidoEn: ahora },
    {
      // El `jobId` de ventana agrupa la ráfaga; el `delay` da tiempo a que termine antes de
      // responder. Ver `ventanaJobId`.
      jobId: ventanaJobId(tenantId, clienteId, ahora),
      delay: env.AI_REPLY_WINDOW_MS,
      // Sin reintentos: cada intento vuelve a pagar embedding + generación, y los fallos
      // esperables (fuera de ventana, cuota) no se arreglan repitiendo.
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}
