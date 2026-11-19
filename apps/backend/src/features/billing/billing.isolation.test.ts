import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { crearTenant } from '../pendiente/pendiente.fixtures.js';
import { asegurarIndicesBilling, dtoPago } from './billing.fixtures.js';
import { Payment } from './payment.model.js';
import {
  crearPagoPendiente,
  obtenerPago,
  obtenerPagoPorReferencia,
  transicionarPago,
} from './payment.service.js';
import { resolverTenantPorReferencia } from './payment.resolver.js';
import { Subscription } from './subscription.model.js';
import { obtenerSuscripcion } from './subscription.service.js';

/** CA-15 — aislamiento multi-tenant de la pasarela (HT-PAY-04). */
describe('HT-PAY-04 — aislamiento de billing', () => {
  let tenantA: Types.ObjectId;
  let tenantB: Types.ObjectId;
  let a: string;
  let b: string;

  beforeEach(async () => {
    await asegurarIndicesBilling();
    tenantA = await crearTenant('EmpresaA');
    tenantB = await crearTenant('EmpresaB');
    a = tenantA.toHexString();
    b = tenantB.toHexString();
  });

  it('el pago de A no se lee desde B (por id ni por referencia)', async () => {
    const pago = await crearPagoPendiente(a, dtoPago());
    await expect(obtenerPago(b, pago._id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(obtenerPagoPorReferencia(b, pago.reference)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('transicionar el pago de A con el tenant B → 404 y A sigue PENDIENTE', async () => {
    const pago = await crearPagoPendiente(a, dtoPago());
    await expect(
      transicionarPago(b, pago._id, 'APROBADO', { origen: 'webhook' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect((await obtenerPago(a, pago._id)).estado).toBe('PENDIENTE');
  });

  it('un tenantId inyectado en los datos lo sobrescribe el del argumento', async () => {
    const dto = { ...dtoPago(), tenantId: b } as ReturnType<typeof dtoPago>;
    const pago = await crearPagoPendiente(a, dto);
    const doc = await Payment.collection.findOne({ reference: pago.reference });
    expect(String(doc?.tenantId)).toBe(a);
  });

  it('A y B tienen cada uno su PENDIENTE a la vez', async () => {
    await expect(crearPagoPendiente(a, dtoPago())).resolves.toMatchObject({ estado: 'PENDIENTE' });
    await expect(crearPagoPendiente(b, dtoPago())).resolves.toMatchObject({ estado: 'PENDIENTE' });
    expect(await Payment.countDocuments({})).toBe(2);
  });

  it('la suscripción de A no la ve B', async () => {
    await createScoped(Subscription, tenantA, { estado: 'activa', periodo: 'anual' });
    expect((await obtenerSuscripcion(a)).estado).toBe('activa');
    expect((await obtenerSuscripcion(b)).estado).toBe('sin_plan');
  });

  it('resolverTenantPorReferencia devuelve el tenant dueño, nunca el otro', async () => {
    const pagoA = await crearPagoPendiente(a, dtoPago());
    const pagoB = await crearPagoPendiente(b, dtoPago());
    expect((await resolverTenantPorReferencia(pagoA.reference))?.tenantId).toBe(a);
    expect((await resolverTenantPorReferencia(pagoB.reference))?.tenantId).toBe(b);
  });

  it('transicionar B no toca a A', async () => {
    const pagoA = await crearPagoPendiente(a, dtoPago());
    const pagoB = await crearPagoPendiente(b, dtoPago());
    await transicionarPago(b, pagoB._id, 'APROBADO', { origen: 'webhook' });
    expect((await obtenerPago(a, pagoA._id)).estado).toBe('PENDIENTE');
  });
});
