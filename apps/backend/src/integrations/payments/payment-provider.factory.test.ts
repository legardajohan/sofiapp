import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WOMPI_OK = {
  PAYMENTS_PROVIDER: 'wompi',
  WOMPI_ENV: 'sandbox',
  WOMPI_PUBLIC_KEY: 'pub_test_x',
  WOMPI_PRIVATE_KEY: 'prv_test_x',
  WOMPI_EVENTS_SECRET: 'test_events_x',
  WOMPI_INTEGRITY_SECRET: 'test_integrity_x',
  WOMPI_REDIRECT_URL: 'https://app.test/pago',
};

async function cargarFactory(vars: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  return import('./payment-provider.factory.js');
}

beforeEach(() => {
  vi.stubEnv('PAYMENTS_PROVIDER', 'stub');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getPaymentProvider', () => {
  it('con stub devuelve el stub', async () => {
    const { getPaymentProvider } = await cargarFactory({ PAYMENTS_PROVIDER: 'stub' });
    expect(getPaymentProvider().nombre).toBe('stub');
  });

  it('con wompi y configuración completa devuelve el cliente Wompi', async () => {
    const { getPaymentProvider } = await cargarFactory(WOMPI_OK);
    expect(getPaymentProvider().nombre).toBe('wompi');
  });

  it('es singleton', async () => {
    const { getPaymentProvider } = await cargarFactory({ PAYMENTS_PROVIDER: 'stub' });
    expect(getPaymentProvider()).toBe(getPaymentProvider());
  });

  it('configDesdeEnv lanza si falta una variable', async () => {
    const { configDesdeEnv } = await cargarFactory({ PAYMENTS_PROVIDER: 'stub' });
    expect(() =>
      configDesdeEnv({
        WOMPI_ENV: 'sandbox',
        WOMPI_PUBLIC_KEY: 'pub_test_x',
        WOMPI_PRIVATE_KEY: undefined,
        WOMPI_EVENTS_SECRET: 'test_events_x',
        WOMPI_INTEGRITY_SECRET: 'test_integrity_x',
        WOMPI_REDIRECT_URL: 'https://app.test/pago',
        WOMPI_HTTP_TIMEOUT_MS: 8000,
      }),
    ).toThrow();
  });
});
