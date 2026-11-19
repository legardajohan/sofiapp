import { esReferenciaValida } from '../../features/billing/payment.reference.js';
import { AppError } from '../../utils/AppError.js';
import type {
  IPaymentProvider,
  TransaccionProveedor,
} from './payment-provider.interface.js';
import { verificarEventoWompi } from './wompi.event.js';
import { calcularChecksumEvento, firmarIntegridad } from './wompi.signature.js';

export const STUB_INTEGRITY_SECRET = 'stub_integrity_secret';
export const STUB_EVENTS_SECRET = 'stub_events_secret';

const PROPIEDADES_EVENTO = [
  'transaction.id',
  'transaction.status',
  'transaction.amount_in_cents',
] as const;

export interface StubPaymentProvider extends IPaymentProvider {
  sembrarTransaccion(t: TransaccionProveedor): void;
  construirEventoFirmado(
    t: TransaccionProveedor,
    opciones?: { timestamp?: number },
  ): { body: unknown; checksum: string };
}

/** Determinista y sin red. Reutiliza las funciones puras de Wompi: las firmas son reales. */
export function createStubPaymentProvider(): StubPaymentProvider {
  const transacciones = new Map<string, TransaccionProveedor>();

  return {
    nombre: 'stub',

    crearIntento(p) {
      if (!esReferenciaValida(p.reference)) {
        return Promise.reject(new AppError('Referencia de pago inválida', 400));
      }
      if (!Number.isSafeInteger(p.amountInCents) || p.amountInCents < 1) {
        return Promise.reject(new AppError('Monto inválido', 400));
      }
      const expirationTime = p.expiraEn.toISOString();
      return Promise.resolve({
        publicKey: 'pub_test_stub',
        currency: 'COP' as const,
        amountInCents: p.amountInCents,
        reference: p.reference,
        expirationTime,
        signatureIntegrity: firmarIntegridad({
          reference: p.reference,
          amountInCents: p.amountInCents,
          currency: 'COP',
          expirationTime,
          integritySecret: STUB_INTEGRITY_SECRET,
        }),
        redirectUrl: 'http://localhost/stub-redirect',
      });
    },

    obtenerTokensAceptacion() {
      return Promise.resolve({
        aceptacion: { token: 'stub_acceptance_token', urlTerminos: 'http://localhost/stub-terminos' },
        datosPersonales: {
          token: 'stub_personal_data_token',
          urlPolitica: 'http://localhost/stub-politica',
        },
      });
    },

    consultarTransaccion(id) {
      const t = transacciones.get(id);
      if (!t) return Promise.reject(new AppError('Recurso no encontrado en la pasarela', 404));
      return Promise.resolve(t);
    },

    buscarPorReferencia(reference) {
      for (const t of transacciones.values()) {
        if (t.reference === reference) return Promise.resolve(t);
      }
      return Promise.resolve(null);
    },

    verificarEvento(body, checksumCabecera) {
      return verificarEventoWompi(body, checksumCabecera, STUB_EVENTS_SECRET);
    },

    sembrarTransaccion(t) {
      transacciones.set(t.id, t);
    },

    construirEventoFirmado(t, opciones = {}) {
      const timestamp = opciones.timestamp ?? Math.floor(Date.now() / 1000);
      const estadoProveedor = t.estadoProveedor;
      const checksum = calcularChecksumEvento(
        [t.id, estadoProveedor, String(t.amountInCents)],
        timestamp,
        STUB_EVENTS_SECRET,
      );
      const body = {
        event: 'transaction.updated',
        data: {
          transaction: {
            id: t.id,
            status: estadoProveedor,
            amount_in_cents: t.amountInCents,
            currency: t.currency,
            reference: t.reference,
          },
        },
        environment: 'test',
        timestamp,
        signature: { properties: [...PROPIEDADES_EVENTO], checksum },
      };
      return { body, checksum };
    },
  };
}
