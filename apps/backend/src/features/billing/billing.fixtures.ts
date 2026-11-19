import { Types } from 'mongoose';
import { Payment } from './payment.model.js';
import { PaymentEvent } from './payment-event.model.js';
import { Subscription } from './subscription.model.js';
import type { CrearPagoPendienteDTO, IAceptaciones } from './billing.types.js';

/** Datos de prueba de la pasarela. Solo para tests: ningún test llama a Wompi. */

/** Construye los índices (únicos y parciales) antes de que un test dependa de ellos. */
export async function asegurarIndicesBilling(): Promise<void> {
  await Promise.all([Payment.init(), PaymentEvent.init(), Subscription.init()]);
}

export function aceptacionesFalsas(): IAceptaciones {
  return {
    tokenAceptacionWompi: 'acc_test_falso',
    tokenDatosPersonalesWompi: 'pda_test_falso',
    versionTerminosSofi: 'v1',
    versionPoliticaDatos: 'v1',
    aceptadoEn: new Date('2026-11-19T12:00:00Z'),
    ip: '203.0.113.7',
  };
}

export function dtoPago(overrides: Partial<CrearPagoPendienteDTO> = {}): CrearPagoPendienteDTO {
  return {
    planId: new Types.ObjectId().toHexString(),
    planVersion: 1,
    periodo: 'trimestral',
    precioTotalCop: '119000.00',
    aceptaciones: aceptacionesFalsas(),
    expiraEn: new Date(Date.now() + 30 * 60_000),
    intentadoPor: new Types.ObjectId().toHexString(),
    ...overrides,
  };
}
