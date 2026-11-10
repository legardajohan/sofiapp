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

/**
 * Sesiones de un usuario revocadas (AUTH-03): cada proceso web corta los sockets vivos de ese
 * usuario. La validación de REST no depende de este aviso —consulta la lista de revocación—; esto
 * solo cierra lo que ya estaba conectado.
 */
export const SESSION_REVOKE_CHANNEL = 'session:revoke';

export interface MensajeSesionRevocada extends MensajeInvalidacion {
  userId: string;
}

let publisher: Redis | null = null;

function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
    publisher.on('error', (err) => logger.error('Redis internal-bus publisher error', { error: String(err) }));
  }
  return publisher;
}

export async function publicarInterno<M extends MensajeInvalidacion>(canal: string, mensaje: M): Promise<void> {
  try {
    await getPublisher().publish(canal, JSON.stringify(mensaje));
  } catch (err) {
    logger.error('No se pudo publicar en el bus interno', { error: String(err), canal });
  }
}

export function suscribirInterno<M extends MensajeInvalidacion = MensajeInvalidacion>(
  canal: string,
  handler: (mensaje: M) => void,
): void {
  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  subscriber.on('error', (err) => logger.error('Redis internal-bus subscriber error', { error: String(err) }));
  subscriber.subscribe(canal, (err) => {
    if (err) logger.error('Fallo al suscribir el bus interno', { error: String(err), canal });
  });
  subscriber.on('message', (_canal, raw) => {
    try {
      const mensaje = JSON.parse(raw) as M;
      if (typeof mensaje.tenantId === 'string') handler(mensaje);
    } catch (err) {
      logger.error('Mensaje ilegible en el bus interno', { error: String(err), canal });
    }
  });
}

export async function publicarSesionRevocada(mensaje: MensajeSesionRevocada): Promise<void> {
  await publicarInterno(SESSION_REVOKE_CHANNEL, mensaje);
}

export function suscribirSesionRevocada(handler: (mensaje: MensajeSesionRevocada) => void): void {
  suscribirInterno<MensajeSesionRevocada>(SESSION_REVOKE_CHANNEL, (mensaje) => {
    if (typeof mensaje.userId === 'string') handler(mensaje);
  });
}
