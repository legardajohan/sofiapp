import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/AppError.js';
import { createWompiHttpClient } from './wompi.http.client.js';

const LLAVE = 'prv_test_LLAVE_SECRETA_DEL_TEST';
const CUERPO_SECRETO = 'CUERPO_SENSIBLE_DE_LA_RESPUESTA';

const respuesta = (status: number, cuerpo: unknown = { data: CUERPO_SECRETO }): Response =>
  new Response(JSON.stringify(cuerpo), { status });

function cliente(respuestas: Array<Response | Error>) {
  const cola = [...respuestas];
  const fetchMock = vi.fn(() => {
    const siguiente = cola.shift();
    if (siguiente === undefined) throw new Error('sin más respuestas simuladas');
    return siguiente instanceof Error ? Promise.reject(siguiente) : Promise.resolve(siguiente);
  });
  const sleep = vi.fn(() => Promise.resolve());
  const http = createWompiHttpClient(
    { baseUrl: 'https://wompi.test/v1', timeoutMs: 1000 },
    { fetch: fetchMock as unknown as typeof fetch, sleep },
  );
  return { http, fetchMock, sleep };
}

const headers = { Authorization: `Bearer ${LLAVE}` };

async function fallo(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error('se esperaba un AppError');
}

afterEach(() => vi.restoreAllMocks());

describe('createWompiHttpClient', () => {
  it('200 → JSON parseado', async () => {
    const { http } = cliente([respuesta(200, { ok: 1 })]);
    await expect(http.get('/x', { headers })).resolves.toEqual({ ok: 1 });
  });

  it('503, 503, 200 → 3 intentos y éxito; el sleep recibe 250 y 500', async () => {
    const { http, fetchMock, sleep } = cliente([respuesta(503), respuesta(503), respuesta(200, { ok: 1 })]);
    await expect(http.get('/x', { headers })).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => (c as unknown as number[])[0])).toEqual([250, 500]);
  });

  it('503 ×3 → AppError 502 tras 2 reintentos', async () => {
    const { http, fetchMock } = cliente([respuesta(503), respuesta(503), respuesta(503)]);
    const e = await fallo(http.get('/x', { headers }));
    expect(e.statusCode).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('429 se reintenta', async () => {
    const { http, fetchMock } = cliente([respuesta(429), respuesta(200, { ok: 1 })]);
    await http.get('/x', { headers });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('404 no se reintenta → AppError 404', async () => {
    const { http, fetchMock } = cliente([respuesta(404)]);
    expect((await fallo(http.get('/x', { headers }))).statusCode).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('422 no se reintenta → 502', async () => {
    const { http, fetchMock } = cliente([respuesta(422)]);
    expect((await fallo(http.get('/x', { headers }))).statusCode).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])('%i → AppError 503 genérico y un logger.error', async (status) => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { http } = cliente([respuesta(status)]);
    const e = await fallo(http.get('/x', { headers }));
    expect(e.statusCode).toBe(503);
    expect(e.message).toBe('La pasarela de pagos no está disponible');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('timeout tras los reintentos → AppError 504', async () => {
    const t = new Error('timeout');
    t.name = 'TimeoutError';
    const { http, fetchMock } = cliente([t, t, t]);
    expect((await fallo(http.get('/x', { headers }))).statusCode).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('error de red agotado → 502', async () => {
    const { http } = cliente([new Error('ECONNRESET'), new Error('ECONNRESET'), new Error('ECONNRESET')]);
    expect((await fallo(http.get('/x', { headers }))).statusCode).toBe(502);
  });

  it('no expone post', () => {
    const { http } = cliente([]);
    expect('post' in http).toBe(false);
  });

  it('ni mensajes ni logger contienen llave, cuerpo ni query', async () => {
    const llamadas: unknown[] = [];
    for (const nivel of ['warn', 'error', 'info'] as const) {
      vi.spyOn(logger, nivel).mockImplementation((...args: unknown[]) => {
        llamadas.push(args);
      });
    }
    for (const status of [500, 401, 404, 422]) {
      const { http } = cliente([respuesta(status), respuesta(status), respuesta(status)]);
      const e = await fallo(http.get('/transactions?reference=SOFI-QUERY_PRIVADA', { headers }));
      expect(e.message).not.toContain(LLAVE);
      expect(e.message).not.toContain(CUERPO_SECRETO);
      expect(e.message).not.toContain('QUERY_PRIVADA');
    }
    const volcado = JSON.stringify(llamadas);
    expect(volcado).not.toContain(LLAVE);
    expect(volcado).not.toContain(CUERPO_SECRETO);
    expect(volcado).not.toContain('QUERY_PRIVADA');
    expect(llamadas.length).toBeGreaterThan(0);
  });
});
