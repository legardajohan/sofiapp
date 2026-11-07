import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Bus interno entre procesos (web ↔ worker) por Redis pub/sub. A diferencia de
 * `realtime.publisher`, lo que viaja aquí NO se reemite a los sockets: son avisos de
 * infraestructura, como la invalidación de cachés por tenant.
 *
 * Mismas reglas que el publicador de tiempo real: publicar nunca lanza y tiene un tope bajo de
 * reintentos; cada proceso suscriptor usa su propia conexión (SUBSCRIBE bloquea el cliente).
 */

/** Invalida la caché de la política de ventanas de envío de un tenant (HU-CONF-01). */
export const SEND_WINDOW_INVALIDATE_CHANNEL = 'send-window:invalidate';

export interface MensajeInvalidacion {
  tenantId: string;
}

let publisher: Redis | null = null;

function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
    publisher.on('error', (err) => logger.error('Redis internal-bus publisher error', { error: String(err) }));
  }
  return publisher;
}

export async function publicarInterno(canal: string, mensaje: MensajeInvalidacion): Promise<void> {
  try {
    await getPublisher().publish(canal, JSON.stringify(mensaje));
  } catch (err) {
    logger.error('No se pudo publicar en el bus interno', { error: String(err), canal });
  }
}

export function suscribirInterno(canal: string, handler: (mensaje: MensajeInvalidacion) => void): void {
  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  subscriber.on('error', (err) => logger.error('Redis internal-bus subscriber error', { error: String(err) }));
  subscriber.subscribe(canal, (err) => {
    if (err) logger.error('Fallo al suscribir el bus interno', { error: String(err), canal });
  });
  subscriber.on('message', (_canal, raw) => {
    try {
      const mensaje = JSON.parse(raw) as MensajeInvalidacion;
      if (typeof mensaje.tenantId === 'string') handler(mensaje);
    } catch (err) {
      logger.error('Mensaje ilegible en el bus interno', { error: String(err), canal });
    }
  });
}
