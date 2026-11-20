import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { asegurarIndicesBilling } from './billing.fixtures.js';
import { PaymentEvent } from './payment-event.model.js';
import { marcarEventoProcesado, registrarEvento } from './payment-event.service.js';
import type { RegistrarEventoDTO } from './billing.types.js';

function evento(clave: string): RegistrarEventoDTO {
  return {
    claveIdempotencia: clave,
    evento: 'transaction.updated',
    transaccionId: 'tx-1',
    estadoReportado: 'APPROVED',
    reference: 'SOFI-AAAAAAAAAAAAAAAAAAAAAAAA',
    amountInCents: 11_900_000,
    currency: 'COP',
    entorno: 'test',
  };
}

describe('HT-PAY-04 — payment-event.service', () => {
  beforeEach(async () => {
    await asegurarIndicesBilling();
  });

  it('la primera vez es nuevo; la misma clave no lanza y devuelve nuevo:false', async () => {
    const a = await registrarEvento(evento('k1'));
    expect(a.nuevo).toBe(true);
    const b = await registrarEvento(evento('k1'));
    expect(b).toEqual({ nuevo: false });
    expect(await PaymentEvent.countDocuments({})).toBe(1);
  });

  it('claves distintas son eventos distintos', async () => {
    await registrarEvento(evento('k1'));
    expect((await registrarEvento(evento('k2'))).nuevo).toBe(true);
  });

  it('marcarEventoProcesado escribe una sola vez', async () => {
    const r = await registrarEvento(evento('k1'));
    if (!r.nuevo) throw new Error('esperaba un evento nuevo');
    const tenantId = new Types.ObjectId().toHexString();
    const paymentId = new Types.ObjectId().toHexString();

    expect(
      await marcarEventoProcesado(r.eventoId, { tenantId, paymentId, resultado: 'aplicado' }),
    ).toBe(true);
    expect(
      await marcarEventoProcesado(r.eventoId, {
        tenantId: null,
        paymentId: null,
        resultado: 'error',
      }),
    ).toBe(false);

    const doc = await PaymentEvent.collection.findOne({ claveIdempotencia: 'k1' });
    expect(doc?.resultado).toBe('aplicado');
    expect(String(doc?.tenantId)).toBe(tenantId);
    expect(doc?.procesadoEn).toBeInstanceOf(Date);
  });
});
