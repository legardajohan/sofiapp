import { Redis } from 'ioredis';
import { RedisStore } from 'rate-limit-redis';
import type { Store } from 'express-rate-limit';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Aísla ioredis + rate-limit-redis (HT-PAY-05). En `test` devuelve `undefined`: express-rate-limit
// usa su MemoryStore y los tests no abren conexiones a Redis.

let conexion: Redis | null = null;
let avisado = false;

function obtenerConexion(): Redis {
  if (conexion) return conexion;
  // `enableOfflineQueue: false`: con Redis caído el comando falla al instante en vez de colgar la
  // petición (el limitador falla abierto).
  const nueva = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  nueva.on('error', () => {
    if (avisado) return;
    avisado = true; // una vez por episodio, sin saturar el log
    logger.warn('Rate limit: conexión a Redis con error');
  });
  nueva.on('ready', () => {
    avisado = false;
  });
  conexion = nueva;
  return nueva;
}

export function crearStoreRedis(prefijo: string): Store | undefined {
  if (env.NODE_ENV === 'test') return undefined;
  const redis = obtenerConexion();
  return new RedisStore({
    prefix: prefijo,
    sendCommand: (comando: string, ...args: string[]) =>
      redis.call(comando, ...args) as Promise<number | string | (number | string)[]>,
  });
}
