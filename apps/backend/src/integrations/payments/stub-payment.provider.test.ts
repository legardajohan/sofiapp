import { describe, expect, it } from 'vitest';
import type { TransaccionProveedor } from './payment-provider.interface.js';
import {
  STUB_INTEGRITY_SECRET,
  createStubPaymentProvider,
} from './stub-payment.provider.js';
import { firmarIntegridad } from './wompi.signature.js';

const REF = 'SOFI-AAAAAAAAAAAAAAAAAAAAAAAA';
const TX: TransaccionProveedor = {
  id: 'stub-tx-1',
  reference: REF,
  estado: 'APROBADO',
  estadoProveedor: 'APPROVED',
  amountInCents: 5000000,
  currency: 'COP',
  metodo: 'CARD',
  detalle: null,
};

describe('stub payment provider', () => {
  it('crearIntento firma con STUB_INTEGRITY_SECRET', async () => {
    const p = createStubPaymentProvider();
    const expiraEn = new Date(Date.now() + 3_600_000);
    const r = await p.crearIntento({ reference: REF, amountInCents: 1000, expiraEn });
    expect(r.signatureIntegrity).toBe(
      firmarIntegridad({
        reference: REF,
        amountInCents: 1000,
        currency: 'COP',
        expirationTime: expiraEn.toISOString(),
        integritySecret: STUB_INTEGRITY_SECRET,
      }),
    );
  });

  it('transacción sembrada se consulta por id y por referencia', async () => {
    const p = createStubPaymentProvider();
    p.sembrarTransaccion(TX);
    await expect(p.consultarTransaccion(TX.id)).resolves.toEqual(TX);
    await expect(p.buscarPorReferencia(REF)).resolves.toEqual(TX);
  });

  it('no sembrada → 404 / null', async () => {
    const p = createStubPaymentProvider();
    await expect(p.consultarTransaccion('nada')).rejects.toMatchObject({ statusCode: 404 });
    await expect(p.buscarPorReferencia(REF)).resolves.toBeNull();
  });

  it('obtenerTokensAceptacion devuelve tokens reconocibles', async () => {
    const t = await createStubPaymentProvider().obtenerTokensAceptacion();
    expect(t.aceptacion.token).toContain('stub');
    expect(t.datosPersonales.token).toContain('stub');
  });

  it('construirEventoFirmado → verificarEvento válido; con monto cambiado → inválido', () => {
    const p = createStubPaymentProvider();
    const { body, checksum } = p.construirEventoFirmado(TX);
    const ok = p.verificarEvento(body, checksum);
    expect(ok.valido).toBe(true);
    if (ok.valido) expect(ok.evento).toMatchObject({ transaccionId: TX.id, estado: 'APROBADO', reference: REF });

    const alterado = structuredClone(body) as { data: { transaction: { amount_in_cents: number } } };
    alterado.data.transaction.amount_in_cents = 1;
    expect(p.verificarEvento(alterado, checksum)).toEqual({ valido: false });
  });
});
