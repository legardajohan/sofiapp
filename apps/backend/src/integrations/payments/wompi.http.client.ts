import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

export interface WompiHttpConfig {
  baseUrl: string;
  timeoutMs: number;
  reintentos?: number;
  backoffBaseMs?: number;
}

export interface WompiHttpDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface WompiHttpClient {
  /** JSON ya parseado. Solo `get`: sin POST no hay nada que reintentar por error. */
  get(ruta: string, opciones: { headers: Record<string, string> }): Promise<unknown>;
}

const dormir = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const esTimeout = (e: unknown): boolean =>
  e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');

const rutaSinQuery = (ruta: string): string => ruta.split('?')[0] ?? ruta;

type Fallo = { tipo: 'timeout' } | { tipo: 'red' } | { tipo: 'status'; status: number };

const esReintentable = (f: Fallo): boolean =>
  f.tipo !== 'status' || f.status === 429 || f.status >= 500;

function aAppError(f: Fallo, ruta: string): AppError {
  if (f.tipo === 'timeout') return new AppError('La pasarela de pagos no respondió a tiempo', 504);
  if (f.tipo === 'red') return new AppError('No se pudo contactar la pasarela de pagos', 502);
  if (f.status === 401 || f.status === 403) {
    // Llaves mal configuradas: problema del operador, no del usuario.
    logger.error('Wompi rechazó las credenciales', { ruta, status: f.status });
    return new AppError('La pasarela de pagos no está disponible', 503);
  }
  if (f.status === 404) return new AppError('Recurso no encontrado en la pasarela', 404);
  return new AppError('La pasarela de pagos respondió con un error', 502);
}

export function createWompiHttpClient(
  cfg: WompiHttpConfig,
  deps: WompiHttpDeps = {},
): WompiHttpClient {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? dormir;
  const reintentos = cfg.reintentos ?? 2;
  const backoffBase = cfg.backoffBaseMs ?? 250;

  return {
    async get(ruta, opciones): Promise<unknown> {
      const logRuta = rutaSinQuery(ruta);
      let fallo: Fallo = { tipo: 'red' };

      for (let intento = 0; intento <= reintentos; intento++) {
        if (intento > 0) await sleep(backoffBase * 2 ** (intento - 1));
        try {
          const res = await doFetch(`${cfg.baseUrl}${ruta}`, {
            method: 'GET',
            headers: { Accept: 'application/json', ...opciones.headers },
            signal: AbortSignal.timeout(cfg.timeoutMs),
          });
          if (res.ok) {
            try {
              return (await res.json()) as unknown;
            } catch {
              throw new AppError('La pasarela de pagos respondió con un formato inesperado', 502);
            }
          }
          fallo = { tipo: 'status', status: res.status };
        } catch (e) {
          if (e instanceof AppError) throw e;
          fallo = esTimeout(e) ? { tipo: 'timeout' } : { tipo: 'red' };
        }
        const status = fallo.tipo === 'status' ? fallo.status : undefined;
        logger.warn('Llamada a Wompi fallida', { ruta: logRuta, status, intento: intento + 1 });
        if (!esReintentable(fallo)) break;
      }
      throw aAppError(fallo, logRuta);
    },
  };
}
