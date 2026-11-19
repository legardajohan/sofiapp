import { describe, it, expect, beforeEach, vi } from 'vitest';
import { crearTenant } from '../pendiente/pendiente.fixtures.js';
import { asegurarIndicesBilling, dtoPago } from './billing.fixtures.js';
import { Payment } from './payment.model.js';
import { crearPagoPendiente } from './payment.service.js';
import { resolverTenantPorReferencia } from './payment.resolver.js';

describe('HT-PAY-04 — resolverTenantPorReferencia', () => {
  beforeEach(async () => {
    await asegurarIndicesBilling();
    vi.restoreAllMocks();
  });

  it('devuelve solo { tenantId, paymentId }', async () => {
    const tenant = (await crearTenant('Acme')).toHexString();
    const pago = await crearPagoPendiente(tenant, dtoPago());
    const r = await resolverTenantPorReferencia(pago.reference);
    expect(r).toEqual({ tenantId: tenant, paymentId: pago._id });
    expect(Object.keys(r ?? {}).sort()).toEqual(['paymentId', 'tenantId']);
  });

  it('referencia desconocida → null', async () => {
    expect(await resolverTenantPorReferencia('SOFI-AAAAAAAAAAAAAAAAAAAAAAAA')).toBeNull();
  });

  it('formato inválido → null sin consultar', async () => {
    const spy = vi.spyOn(Payment, 'findOne');
    expect(await resolverTenantPorReferencia('x')).toBeNull();
    expect(await resolverTenantPorReferencia('{"$ne":null}')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
