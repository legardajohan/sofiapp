import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Types } from 'mongoose';
import { crearTenant } from '../pendiente/pendiente.fixtures.js';
import { asegurarIndicesBilling, dtoPago } from './billing.fixtures.js';
import * as referencia from './payment.reference.js';
import { Payment } from './payment.model.js';
import {
  crearPagoPendiente,
  obtenerPago,
  obtenerPagoPorReferencia,
  transicionarPago,
} from './payment.service.js';

describe('HT-PAY-04 — payment.service', () => {
  let tenant: string;
  let tenantObj: Types.ObjectId;

  beforeEach(async () => {
    await asegurarIndicesBilling();
    tenantObj = await crearTenant('Acme');
    tenant = tenantObj.toHexString();
    vi.restoreAllMocks();
  });

  describe('crearPagoPendiente', () => {
    it('crea PENDIENTE con centavos, base e IVA y referencia válida', async () => {
      const pago = await crearPagoPendiente(tenant, dtoPago());
      expect(pago.estado).toBe('PENDIENTE');
      expect(pago.amountInCents).toBe(11_900_000);
      expect(pago.currency).toBe('COP');
      expect(pago.precio).toEqual({
        totalCop: '119000.00',
        baseCop: '100000.00',
        ivaCop: '19000.00',
        ivaPct: '19',
      });
      expect(referencia.esReferenciaValida(pago.reference)).toBe(true);
      expect(pago.finalizadoEn).toBeNull();
    });

    it('un segundo PENDIENTE del mismo tenant → 409', async () => {
      await crearPagoPendiente(tenant, dtoPago());
      await expect(crearPagoPendiente(tenant, dtoPago())).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('con el primero ya terminal, se puede crear otro', async () => {
      const p = await crearPagoPendiente(tenant, dtoPago());
      await transicionarPago(tenant, p._id, 'RECHAZADO', { origen: 'webhook' });
      await expect(crearPagoPendiente(tenant, dtoPago())).resolves.toMatchObject({
        estado: 'PENDIENTE',
      });
    });

    it('reintenta ante una colisión de referencia', async () => {
      const primero = await crearPagoPendiente(tenant, dtoPago());
      await transicionarPago(tenant, primero._id, 'EXPIRADO', { origen: 'conciliacion' });
      const spy = vi
        .spyOn(referencia, 'generarReferencia')
        .mockReturnValueOnce(primero.reference)
        .mockReturnValueOnce(primero.reference)
        .mockReturnValue('SOFI-ZZZZZZZZZZZZZZZZZZZZZZZZ');
      const nuevo = await crearPagoPendiente(tenant, dtoPago());
      expect(nuevo.reference).toBe('SOFI-ZZZZZZZZZZZZZZZZZZZZZZZZ');
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('rechaza un importe inválido con 400', async () => {
      await expect(
        crearPagoPendiente(tenant, dtoPago({ precioTotalCop: '10.555' })),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('transicionarPago', () => {
    it('aplica PENDIENTE → APROBADO y guarda el contexto', async () => {
      const p = await crearPagoPendiente(tenant, dtoPago());
      const r = await transicionarPago(tenant, p._id, 'APROBADO', {
        origen: 'webhook',
        providerTransactionId: 'tx-1',
        metodo: 'CARD',
        detalleProveedor: 'x'.repeat(900),
      });
      expect(r.resultado).toBe('aplicada');
      expect(r.pago.estado).toBe('APROBADO');
      expect(r.pago.finalizadoEn).not.toBeNull();
      const doc = await Payment.collection.findOne({ reference: p.reference });
      expect(doc?.origenTransicion).toBe('webhook');
      expect(doc?.providerTransactionId).toBe('tx-1');
      expect(doc?.metodo).toBe('CARD');
      expect((doc?.detalleProveedor as string).length).toBe(500);
    });

    it('repetir la misma transición → sin_cambio y no reescribe', async () => {
      const p = await crearPagoPendiente(tenant, dtoPago());
      const a = await transicionarPago(tenant, p._id, 'APROBADO', { origen: 'webhook' });
      const b = await transicionarPago(tenant, p._id, 'APROBADO', { origen: 'conciliacion' });
      expect(b.resultado).toBe('sin_cambio');
      expect(b.pago.finalizadoEn).toBe(a.pago.finalizadoEn);
      const doc = await Payment.collection.findOne({ reference: p.reference });
      expect(doc?.origenTransicion).toBe('webhook');
    });

    it('otro terminal sobre un terminal → rechazada y no modifica', async () => {
      const p = await crearPagoPendiente(tenant, dtoPago());
      await transicionarPago(tenant, p._id, 'APROBADO', { origen: 'webhook' });
      const r = await transicionarPago(tenant, p._id, 'ANULADO', { origen: 'webhook' });
      expect(r.resultado).toBe('rechazada');
      expect(r.pago.estado).toBe('APROBADO');
    });

    it('un destino no terminal → 400', async () => {
      const p = await crearPagoPendiente(tenant, dtoPago());
      await expect(
        transicionarPago(tenant, p._id, 'PENDIENTE', { origen: 'webhook' }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('un pago inexistente → 404', async () => {
      await expect(
        transicionarPago(tenant, '64b000000000000000000001', 'APROBADO', { origen: 'webhook' }),
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        transicionarPago(tenant, 'no-es-id', 'APROBADO', { origen: 'webhook' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('providerTransactionId repetido en otro pago → 409', async () => {
      const p1 = await crearPagoPendiente(tenant, dtoPago());
      await transicionarPago(tenant, p1._id, 'APROBADO', {
        origen: 'webhook',
        providerTransactionId: 'tx-dup',
      });
      const otro = await crearScopedOtroTenantPendiente();
      await expect(
        transicionarPago(otro.tenant, otro.pagoId, 'APROBADO', {
          origen: 'webhook',
          providerTransactionId: 'tx-dup',
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('concurrencia: APROBADO y RECHAZADO a la vez → gana uno solo', async () => {
      const p = await crearPagoPendiente(tenant, dtoPago());
      const [a, b] = await Promise.all([
        transicionarPago(tenant, p._id, 'APROBADO', { origen: 'webhook' }),
        transicionarPago(tenant, p._id, 'RECHAZADO', { origen: 'conciliacion' }),
      ]);
      const resultados = [a.resultado, b.resultado].sort();
      expect(resultados).toEqual(['aplicada', 'rechazada']);
      const ganador = a.resultado === 'aplicada' ? a : b;
      const final = await obtenerPago(tenant, p._id);
      expect(final.estado).toBe(ganador.pago.estado);
    });
  });

  describe('lecturas', () => {
    it('obtenerPago y obtenerPagoPorReferencia devuelven el pago del tenant', async () => {
      const p = await crearPagoPendiente(tenant, dtoPago());
      expect((await obtenerPago(tenant, p._id)).reference).toBe(p.reference);
      expect((await obtenerPagoPorReferencia(tenant, p.reference))._id).toBe(p._id);
    });

    it('inexistente → 404', async () => {
      await expect(obtenerPago(tenant, '64b000000000000000000001')).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(
        obtenerPagoPorReferencia(tenant, 'SOFI-AAAAAAAAAAAAAAAAAAAAAAAA'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  async function crearScopedOtroTenantPendiente(): Promise<{ tenant: string; pagoId: string }> {
    const t = (await crearTenant('Otra')).toHexString();
    const p = await crearPagoPendiente(t, dtoPago());
    return { tenant: t, pagoId: p._id };
  }
});
