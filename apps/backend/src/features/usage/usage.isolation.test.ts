import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../cliente/cliente.model.js';
import { TenantUsage } from './usage.model.js';
import { findOneScoped } from '../../repositories/base.repository.js';
import { getCurrentPeriodo, getMetricUsed, incrementUsage } from './usage.service.js';
import type { ITenantUsageDocument } from './usage.types.js';

// Test de aislamiento multi-tenant obligatorio (docs/multi-tenancy.md §8).
describe('usage — aislamiento multi-tenant (HU-SAAS-02)', () => {
  const tenantA = new Types.ObjectId().toString();
  const tenantB = new Types.ObjectId().toString();

  it('incrementUsage de un tenant no afecta el uso de otro', async () => {
    await incrementUsage(tenantA, 'mensajesMes');
    await incrementUsage(tenantA, 'mensajesMes');

    expect(await getMetricUsed(tenantA, 'mensajesMes')).toBe(2);
    expect(await getMetricUsed(tenantB, 'mensajesMes')).toBe(0);
  });

  it('el conteo de leads no cruza tenants', async () => {
    await Cliente.create({
      tenantId: new Types.ObjectId(tenantA),
      metaUserId: 'wa-1',
      telefono: '3001112222',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tags: [],
    });

    expect(await getMetricUsed(tenantA, 'leads')).toBe(1);
    expect(await getMetricUsed(tenantB, 'leads')).toBe(0);
  });

  it('un documento tenant_usage de A no es accesible con el scope de B', async () => {
    await incrementUsage(tenantA, 'campanasMes');

    const docA = await findOneScoped(TenantUsage, tenantA, {
      periodo: getCurrentPeriodo(),
    }).lean<ITenantUsageDocument>();
    const docB = await findOneScoped(TenantUsage, tenantB, {
      periodo: getCurrentPeriodo(),
    }).lean<ITenantUsageDocument>();

    expect(docA).not.toBeNull();
    expect(docB).toBeNull();
  });
});
