import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../utils/AppError.js';
import { createWompiProvider, WOMPI_BASE_URL, type WompiConfig } from './wompi.provider.js';
import { firmarIntegridad } from './wompi.signature.js';

const CFG: WompiConfig = {
  env: 'sandbox',
  publicKey: 'pub_test_PUBLICA',
  privateKey: 'prv_test_PRIVADA_SECRETA',
  eventsSecret: 'test_events_SECRETO_EVENTOS',
  integritySecret: 'test_integrity_SECRETO_INTEGRIDAD',
  redirectUrl: 'https://app.test/pago/resultado',
  timeoutMs: 1000,
};
const REF = 'SOFI-AAAAAAAAAAAAAAAAAAAAAAAA';

const json = (cuerpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(cuerpo), { status });

function proveedor(respuestas: Response[], cfg: WompiConfig = CFG) {
  const cola = [...respuestas];
  const fetchMock = vi.fn((..._args: unknown[]) => {
    const r = cola.shift();
    return Promise.resolve(r ?? json({}, 500));
  });
  const p = createWompiProvider(cfg, {
    fetch: fetchMock as unknown as typeof fetch,
    sleep: () => Promise.resolve(),
  });
  return { p, fetchMock };
}

const urlLlamada = (m: ReturnType<typeof vi.fn>, i = 0): string => String(m.mock.calls[i]?.[0]);
const headersLlamada = (m: ReturnType<typeof vi.fn>, i = 0): Record<string, string> =>
  ((m.mock.calls[i]?.[1] as { headers: Record<string, string> }).headers);

const tx = (extra: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  status: 'APPROVED',
  amount_in_cents: 11900000,
  currency: 'COP',
  reference: REF,
  payment_method_type: 'CARD',
  status_message: null,
  ...extra,
});

describe('URL base', () => {
  it.each(['sandbox', 'production'] as const)('%s', async (env) => {
    const { p, fetchMock } = proveedor([json({ data: tx() })], { ...CFG, env });
    await p.consultarTransaccion('tx-1');
    expect(urlLlamada(fetchMock).startsWith(WOMPI_BASE_URL[env])).toBe(true);
  });
});

describe('crearIntento', () => {
  const en = (ms: number): Date => new Date(Date.now() + ms);

  it('forma completa, firma correcta y sin secretos', async () => {
    const { p } = proveedor([]);
    const expiraEn = en(3_600_000);
    const r = await p.crearIntento({ reference: REF, amountInCents: 11900000, expiraEn });
    expect(r).toEqual({
      publicKey: CFG.publicKey,
      currency: 'COP',
      amountInCents: 11900000,
      reference: REF,
      expirationTime: expiraEn.toISOString(),
      signatureIntegrity: firmarIntegridad({
        reference: REF,
        amountInCents: 11900000,
        currency: 'COP',
        expirationTime: expiraEn.toISOString(),
        integritySecret: CFG.integritySecret,
      }),
      redirectUrl: CFG.redirectUrl,
    });
    const volcado = JSON.stringify(r);
    expect(volcado).not.toContain(CFG.privateKey);
    expect(volcado).not.toContain(CFG.integritySecret);
    expect(volcado).not.toContain(CFG.eventsSecret);
  });

  it.each([
    ['referencia inválida', { reference: 'x' }],
    ['monto 0', { amountInCents: 0 }],
    ['monto -1', { amountInCents: -1 }],
    ['monto 1.5', { amountInCents: 1.5 }],
    ['monto 2^53', { amountInCents: 2 ** 53 }],
    ['expiraEn pasado', { expiraEn: en(-1000) }],
    ['expiraEn a 30 s', { expiraEn: en(30_000) }],
    ['expiraEn a 25 h', { expiraEn: en(25 * 3_600_000) }],
  ])('rechaza con 400: %s', async (_n, cambio) => {
    const { p } = proveedor([]);
    const params = { reference: REF, amountInCents: 1000, expiraEn: en(3_600_000), ...cambio };
    await expect(p.crearIntento(params)).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each([2 * 60_000, 24 * 3_600_000 - 5000])('acepta expiración a %i ms', async (ms) => {
    const { p } = proveedor([]);
    await expect(
      p.crearIntento({ reference: REF, amountInCents: 1000, expiraEn: en(ms) }),
    ).resolves.toBeDefined();
  });
});

describe('obtenerTokensAceptacion', () => {
  const merchant = {
    data: {
      presigned_acceptance: { acceptance_token: 'tok-a', permalink: 'https://t.test/terminos' },
      presigned_personal_data_auth: { acceptance_token: 'tok-d', permalink: 'https://t.test/datos' },
    },
  };

  it('llama a /merchants/info con la llave pública y mapea los tokens', async () => {
    const { p, fetchMock } = proveedor([json(merchant)]);
    await expect(p.obtenerTokensAceptacion()).resolves.toEqual({
      aceptacion: { token: 'tok-a', urlTerminos: 'https://t.test/terminos' },
      datosPersonales: { token: 'tok-d', urlPolitica: 'https://t.test/datos' },
    });
    expect(urlLlamada(fetchMock)).toBe(`${WOMPI_BASE_URL.sandbox}/merchants/info`);
    const h = headersLlamada(fetchMock);
    expect(h['x-merchant-public-key']).toBe(CFG.publicKey);
    expect(h['Authorization']).toBeUndefined();
  });

  it('sin presigned_acceptance → AppError 502', async () => {
    const { p } = proveedor([json({ data: { presigned_personal_data_auth: merchant.data.presigned_personal_data_auth } })]);
    await expect(p.obtenerTokensAceptacion()).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe('consultarTransaccion', () => {
  it('mapea estado y estadoProveedor, con llave privada', async () => {
    const { p, fetchMock } = proveedor([json({ data: tx({ status: 'DECLINED' }) })]);
    const r = await p.consultarTransaccion('tx-1');
    expect(r).toMatchObject({ id: 'tx-1', estado: 'RECHAZADO', estadoProveedor: 'DECLINED', metodo: 'CARD', detalle: null });
    expect(headersLlamada(fetchMock)['Authorization']).toBe(`Bearer ${CFG.privateKey}`);
  });

  it('404 → AppError 404', async () => {
    const { p } = proveedor([json({}, 404)]);
    const e: unknown = await p.consultarTransaccion('nada').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).statusCode).toBe(404);
  });
});

describe('buscarPorReferencia', () => {
  it('data vacío → null', async () => {
    const { p } = proveedor([json({ data: [] })]);
    await expect(p.buscarPorReferencia(REF)).resolves.toBeNull();
  });

  it('404 → null', async () => {
    const { p } = proveedor([json({}, 404)]);
    await expect(p.buscarPorReferencia(REF)).resolves.toBeNull();
  });

  it('varias → la de created_at mayor, con llave privada', async () => {
    const { p, fetchMock } = proveedor([
      json({
        data: [
          tx({ id: 'viejo', created_at: '2026-01-01T00:00:00Z', status: 'DECLINED' }),
          tx({ id: 'nuevo', created_at: '2026-02-01T00:00:00Z' }),
        ],
      }),
    ]);
    const r = await p.buscarPorReferencia(REF);
    expect(r?.id).toBe('nuevo');
    expect(urlLlamada(fetchMock)).toBe(`${WOMPI_BASE_URL.sandbox}/transactions?reference=${REF}`);
    expect(headersLlamada(fetchMock)['Authorization']).toBe(`Bearer ${CFG.privateKey}`);
  });

  it('referencia inválida → 400 sin llamar a Wompi', async () => {
    const { p, fetchMock } = proveedor([]);
    await expect(p.buscarPorReferencia('a&b=c')).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('verificarEvento', () => {
  it('usa el eventsSecret de la configuración', () => {
    const { p } = proveedor([]);
    expect(p.verificarEvento({})).toEqual({ valido: false });
  });
});
