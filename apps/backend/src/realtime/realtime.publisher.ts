import { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { REALTIME_CHANNEL, type RealtimeEvent } from './realtime.types.js';

/**
 * Puente de tiempo real por Redis pub/sub. Los eventos nacen en el proceso worker
 * (entrantes de WhatsApp) o en el proceso web (respuestas del asesor), pero el `io`
 * de Socket.IO vive solo en el proceso web. El worker PUBLICA; el web SUSCRIBE y reemite
 * al room del tenant. Cada proceso usa su propia conexión (SUBSCRIBE bloquea el cliente).
 */

let publisher: Redis | null = null;

/**
 * Cuántos reintentos espera un `publish` con la conexión caída antes de rendirse.
 *
 * **No puede ser `null` aquí.** `null` significa "reintentar indefinidamente" y es lo que exigen
 * las conexiones bloqueantes de BullMQ, pero en este publicador convierte a `publishRealtime` en
 * una espera infinita: el comando se queda en la cola offline de ioredis, nunca rechaza, y el
 * `catch` de abajo —que promete fallar suave— no llega a ejecutarse nunca. Con Redis caído eso
 * cuelga para siempre a TODO el que publique: `setIaHabilitada`, `replyMessage`, `assign`, las
 * etiquetas... es decir, peticiones HTTP que nunca responden por un evento que solo es un aviso.
 *
 * Con un tope bajo se conserva lo útil de la cola offline (un corte de un instante se absorbe y el
 * evento sale igual) y se acota lo dañino (con Redis realmente caído rechaza en decenas de ms).
 */
const MAX_REINTENTOS_PUBLISH = 2;

function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: MAX_REINTENTOS_PUBLISH });
    publisher.on('error', (err) => logger.error('Redis publisher error', { error: String(err) }));
  }
  return publisher;
}

/** Publica un evento de tiempo real en el canal Redis. Nunca lanza: falla suave y loguea. */
export async function publishRealtime(evt: RealtimeEvent): Promise<void> {
  try {
    await getPublisher().publish(REALTIME_CHANNEL, JSON.stringify(evt));
  } catch (err) {
    logger.error('No se pudo publicar evento de tiempo real', { error: String(err), type: evt.type });
  }
}

/** Suscribe el gateway `io` al canal Redis y reemite cada evento al room `tenant:<id>`. */
export function subscribeRealtime(io: Server): void {
  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  subscriber.on('error', (err) => logger.error('Redis subscriber error', { error: String(err) }));

  subscriber.subscribe(REALTIME_CHANNEL, (err) => {
    if (err) {
      logger.error('Fallo al suscribir el canal de tiempo real', { error: String(err) });
      return;
    }
    logger.info('Gateway suscrito al canal de tiempo real');
  });

  subscriber.on('message', (_channel, raw) => {
    let evt: RealtimeEvent;
    try {
      evt = JSON.parse(raw) as RealtimeEvent;
    } catch (parseErr) {
      logger.error('Evento de tiempo real ilegible', { error: String(parseErr) });
      return;
    }
    if (evt.type === 'conversation:assigned') {
      // Todos los admins del tenant refrescan la lista; el toast va SOLO al destinatario.
      io.to(`tenant:${evt.tenantId}`).emit('conversation:updated', {
        type: 'conversation:updated',
        tenantId: evt.tenantId,
        conversationId: evt.conversationId,
        conversation: evt.conversation,
      });
      if (evt.targetUserId) io.to(`asesor:${evt.targetUserId}`).emit(evt.type, evt);
      return;
    }

    io.to(`tenant:${evt.tenantId}`).emit(evt.type, evt);
  });
}
