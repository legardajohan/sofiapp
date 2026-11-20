import { describe, expect, it } from 'vitest';
import { configDesdeEnv } from './payment-provider.factory.js';
import { createWompiProvider } from './wompi.provider.js';

// Prueba de contrato contra el SANDBOX real de Wompi. Fuera de `pnpm test` por defecto: solo corre
// con `WOMPI_CONTRACT_TEST=1` y llaves de sandbox en el entorno (WOMPI_PUBLIC_KEY, etc.).
// Opcionales: `WOMPI_CONTRACT_TX_ID` / `WOMPI_CONTRACT_TX_REF` (una transacción de sandbox) y
// `WOMPI_CONTRACT_EVENT_BODY` / `WOMPI_CONTRACT_EVENT_CHECKSUM` (un evento real, JSON).
// Cierra las incógnitas de wompi.md: mayúsculas del checksum, auth de /transactions?reference=
// y estados adicionales.
const activo = Boolean(process.env['WOMPI_CONTRACT_TEST']);

describe.skipIf(!activo)('contrato Wompi sandbox', () => {
  const proveedor = (): ReturnType<typeof createWompiProvider> => {
    const e = process.env;
    return createWompiProvider(
      configDesdeEnv({
        WOMPI_ENV: 'sandbox',
        WOMPI_PUBLIC_KEY: e['WOMPI_PUBLIC_KEY'],
        WOMPI_PRIVATE_KEY: e['WOMPI_PRIVATE_KEY'],
        WOMPI_EVENTS_SECRET: e['WOMPI_EVENTS_SECRET'],
        WOMPI_INTEGRITY_SECRET: e['WOMPI_INTEGRITY_SECRET'],
        WOMPI_REDIRECT_URL: e['WOMPI_REDIRECT_URL'] ?? 'https://app.test/pago',
        WOMPI_HTTP_TIMEOUT_MS: 8000,
      }),
    );
  };

  it('/merchants/info devuelve los dos tokens de aceptación', async () => {
    const t = await proveedor().obtenerTokensAceptacion();
    expect(t.aceptacion.token).toBeTruthy();
    expect(t.datosPersonales.token).toBeTruthy();
  });

  it.skipIf(!process.env['WOMPI_CONTRACT_TX_ID'])('consulta por id', async () => {
    const r = await proveedor().consultarTransaccion(String(process.env['WOMPI_CONTRACT_TX_ID']));
    expect(r.estadoProveedor).toBeTruthy();
  });

  it.skipIf(!process.env['WOMPI_CONTRACT_TX_REF'])('consulta por referencia', async () => {
    const r = await proveedor().buscarPorReferencia(String(process.env['WOMPI_CONTRACT_TX_REF']));
    expect(r).not.toBeNull();
  });

  it.skipIf(!process.env['WOMPI_CONTRACT_EVENT_BODY'])('verifica un evento real de sandbox', () => {
    const body: unknown = JSON.parse(String(process.env['WOMPI_CONTRACT_EVENT_BODY']));
    const r = proveedor().verificarEvento(body, process.env['WOMPI_CONTRACT_EVENT_CHECKSUM']);
    expect(r.valido).toBe(true);
  });
});
