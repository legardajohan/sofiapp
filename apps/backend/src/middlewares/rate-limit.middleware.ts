import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit, type Store } from 'express-rate-limit';
import { env } from '../config/env.js';
import { LIMITE_INTENTOS_PAGO, LIMITE_WEBHOOK_PAGOS } from '../config/rate-limits.js';
import { logger } from '../utils/logger.js';
import { crearStoreRedis } from './rate-limit.redis-store.js';

export interface OpcionesLimitador {
  max?: number;
  /** Inyectable para tests; por defecto, Redis (memoria en `test`). */
  store?: Store;
}

const MENSAJE_429 = 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.';

/**
 * Envuelve el store para que un fallo suyo se registre (solo el nombre del limitador, nada de la
 * petición). `passOnStoreError` hace que la petición pase: el limitador falla ABIERTO, porque un
 * Redis caído no puede hacer perder confirmaciones de pago de Wompi.
 */
function conAvisoDeFallo(store: Store | undefined, limitador: string): Store | undefined {
  if (!store) return undefined;
  const avisar = (): void => {
    logger.warn('Rate limit: store no disponible', { limitador });
  };
  const envuelto: Store = {
    ...(store.init && { init: store.init.bind(store) }),
    ...(store.get && { get: store.get.bind(store) }),
    increment: async (key) => {
      try {
        return await store.increment(key);
      } catch (e) {
        avisar();
        throw e;
      }
    },
    decrement: async (key) => {
      try {
        await store.decrement(key);
      } catch (e) {
        avisar();
        throw e;
      }
    },
    resetKey: (key) => store.resetKey(key),
    ...(store.resetAll && { resetAll: store.resetAll.bind(store) }),
    ...(store.prefix !== undefined && { prefix: store.prefix }),
    ...(store.localKeys !== undefined && { localKeys: store.localKeys }),
  };
  return envuelto;
}

function crear(
  nombre: string,
  cfg: { ventanaMs: number; prefijo: string },
  max: number,
  keyGenerator: (req: Request) => string,
  op: OpcionesLimitador,
): RequestHandler {
  const store = conAvisoDeFallo(op.store ?? crearStoreRedis(cfg.prefijo), nombre);
  return rateLimit({
    windowMs: cfg.ventanaMs,
    limit: op.max ?? max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: true,
    keyGenerator,
    ...(store && { store }),
    handler: (_req, res) => {
      res.status(429).json({ message: MENSAJE_429 });
    },
  });
}

const clavePorIp = (req: Request): string => ipKeyGenerator(req.ip ?? '');

/** Webhook de Wompi: por IP. Va en `app.ts` ANTES de `express.json()` y no toca el cuerpo. */
export function crearLimitadorWebhookPagos(op: OpcionesLimitador = {}): RequestHandler {
  return crear('webhook-pagos', LIMITE_WEBHOOK_PAGOS, env.RATE_LIMIT_WEBHOOK_PAGOS_MAX, clavePorIp, op);
}

/**
 * Creación de intentos de pago: por tenant del TOKEN. Solo lee `req.user`; nunca el cuerpo, la
 * query, los params ni cabeceras. Va entre `authorize` y `validate`.
 */
export function crearLimitadorIntentosPago(op: OpcionesLimitador = {}): RequestHandler {
  return crear(
    'intentos-pago',
    LIMITE_INTENTOS_PAGO,
    env.RATE_LIMIT_INTENTOS_MAX,
    (req) => (req.user?.tenantId ? `tenant:${req.user.tenantId.toString()}` : clavePorIp(req)),
    op,
  );
}
