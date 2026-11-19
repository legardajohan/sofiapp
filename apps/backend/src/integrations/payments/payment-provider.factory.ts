import { env } from '../../config/env.js';
import type { IPaymentProvider } from './payment-provider.interface.js';
import { createStubPaymentProvider } from './stub-payment.provider.js';
import { createWompiProvider, type WompiConfig } from './wompi.provider.js';

type EntornoWompi = Pick<
  typeof env,
  | 'WOMPI_ENV'
  | 'WOMPI_PUBLIC_KEY'
  | 'WOMPI_PRIVATE_KEY'
  | 'WOMPI_EVENTS_SECRET'
  | 'WOMPI_INTEGRITY_SECRET'
  | 'WOMPI_REDIRECT_URL'
  | 'WOMPI_HTTP_TIMEOUT_MS'
>;

/** Estrecha las variables opcionales; `payments-env` ya las exige, esto es red de seguridad. */
export function configDesdeEnv(e: EntornoWompi): WompiConfig {
  const { WOMPI_PUBLIC_KEY, WOMPI_PRIVATE_KEY, WOMPI_EVENTS_SECRET, WOMPI_INTEGRITY_SECRET } = e;
  if (
    !WOMPI_PUBLIC_KEY ||
    !WOMPI_PRIVATE_KEY ||
    !WOMPI_EVENTS_SECRET ||
    !WOMPI_INTEGRITY_SECRET ||
    !e.WOMPI_REDIRECT_URL
  ) {
    throw new Error('Configuración de Wompi incompleta.');
  }
  return {
    env: e.WOMPI_ENV,
    publicKey: WOMPI_PUBLIC_KEY,
    privateKey: WOMPI_PRIVATE_KEY,
    eventsSecret: WOMPI_EVENTS_SECRET,
    integritySecret: WOMPI_INTEGRITY_SECRET,
    redirectUrl: e.WOMPI_REDIRECT_URL,
    timeoutMs: e.WOMPI_HTTP_TIMEOUT_MS,
  };
}

let instancia: IPaymentProvider | null = null;

/** Singleton perezoso por proceso. */
export function getPaymentProvider(): IPaymentProvider {
  instancia ??=
    env.PAYMENTS_PROVIDER === 'wompi'
      ? createWompiProvider(configDesdeEnv(env))
      : createStubPaymentProvider();
  return instancia;
}

/** Solo para tests. */
export function resetPaymentProviderForTests(): void {
  instancia = null;
}
