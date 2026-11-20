import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { crearTenant } from '../pendiente/pendiente.fixtures.js';
import { asegurarIndicesBilling } from './billing.fixtures.js';
import { Subscription } from './subscription.model.js';
import { obtenerSuscripcion } from './subscription.service.js';

describe('HT-PAY-04 — subscription.service', () => {
  beforeEach(async () => {
    await asegurarIndicesBilling();
  });

  it('sin documento → sin_plan y no escribe nada', async () => {
    const tenant = (await crearTenant('Acme')).toHexString();
    const s = await obtenerSuscripcion(tenant);
    expect(s.estado).toBe('sin_plan');
    expect(s.renovacionAutomatica).toBe(false);
    expect(await Subscription.countDocuments({})).toBe(0);
  });

  it('con documento devuelve sus valores serializados', async () => {
    const tenantId = await crearTenant('Acme');
    const planId = new Types.ObjectId();
    await createScoped(Subscription, tenantId, {
      estado: 'activa',
      planId,
      planVersion: 2,
      periodo: 'anual',
      vigenciaDesde: new Date('2026-11-01T00:00:00Z'),
      vigenciaHasta: new Date('2027-11-01T00:00:00Z'),
      origen: 'pago',
    });
    const s = await obtenerSuscripcion(tenantId.toHexString());
    expect(s).toMatchObject({
      estado: 'activa',
      planId: planId.toHexString(),
      planVersion: 2,
      periodo: 'anual',
      origen: 'pago',
      vigenciaHasta: '2027-11-01T00:00:00.000Z',
    });
  });

  it('una suscripción por tenant (índice único)', async () => {
    const tenantId = await crearTenant('Acme');
    await createScoped(Subscription, tenantId, {});
    await expect(createScoped(Subscription, tenantId, {})).rejects.toMatchObject({ code: 11000 });
  });
});
