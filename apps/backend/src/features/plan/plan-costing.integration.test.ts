import { describe, it, expect } from 'vitest';
import { Tenant } from '../tenant/tenant.model.js';
import { createPlan, nuevaVersionPlan } from './plan.service.js';
import { assignPlanToTenant } from '../tenant/tenant.service.js';
import { registerOficial, registerManual } from '../exchange-rate/exchange-rate.service.js';
import { createCostItem } from '../cost-catalog/cost-catalog.service.js';
import type { ITrmProvider } from '../../integrations/trm/trm-provider.interface.js';

const limites = { usuarios: 3, administradores: 10, mensajesMes: 1000, leads: 500, campanasMes: 2 };

function providerOk(tasa: string): ITrmProvider {
  return {
    tipoFuente: 'BANCO_REPUBLICA',
    fetchTrmVigente: async () => ({
      tasaCopPorUsd: tasa,
      fechaVigencia: new Date(),
      fuente: 'Banco de la República (test)',
    }),
  };
}

async function crearTenant(slug: string) {
  return Tenant.create({
    nombre: `T ${slug}`,
    slug,
    contacto: { email: `${slug}@t.com`, telefono: '3000000000' },
    estado: 'activo',
  });
}

describe('costeo de planes — Fase E (fotografía + no-retroactividad)', () => {
  it('createPlan sin TRM no genera fotografía pero crea el plan (no bloquea)', async () => {
    const plan = await createPlan({ nombre: 'SinTRM', limites, precio: 100000 });
    expect(plan.numeroVersion).toBe(1);
    expect(plan.fotografiaFinanciera).toBeUndefined();
  });

  it('createPlan con TRM y costo por administrador genera la fotografía (subtotal admins correcto)', async () => {
    await registerOficial(providerOk('4000'));
    await createCostItem({
      concepto: 'Costo por administrador',
      currency: 'COP',
      unitCostOriginal: '8000',
      unit: 'administrador',
    });

    const plan = await createPlan({ nombre: 'ConTRM', limites, precio: 50 });
    expect(plan.fotografiaFinanciera).toBeDefined();
    // 10 administradores × 8.000 = 80.000
    expect(plan.fotografiaFinanciera?.subtotalAdministradoresCop).toBe('80000');
    expect(plan.fotografiaFinanciera?.trmOficial).toBe('4000');
    expect(plan.fotografiaFinanciera?.precioFinalUsd).toBe('50'); // precio en USD
    expect(plan.fotografiaFinanciera?.precioFinalCop).toBe('200000'); // 50 USD × 4000 TRM
  });

  it('CA-24: cambiar la TRM NO altera el precio congelado del tenant ya contratado', async () => {
    await registerOficial(providerOk('4000'));
    const plan = await createPlan({ nombre: 'Contratable', limites, precio: 50 });
    const tenant = await crearTenant('empresa-contrato');

    const asignado = await assignPlanToTenant(tenant._id.toString(), plan._id);
    expect(asignado.fotografiaFinancieraContratada?.trmOficial).toBe('4000');
    expect(asignado.fotografiaFinancieraContratada?.precioFinalUsd).toBe('50');
    expect(asignado.planContratadoVersion).toBe(1);

    // La TRM sube; el tenant NO debe recalcularse.
    await registerOficial(providerOk('5000'));
    const releido = await Tenant.findById(tenant._id).lean();
    expect(releido?.fotografiaFinancieraContratada?.trmOficial).toBe('4000'); // congelado
    expect(releido?.fotografiaFinancieraContratada?.precioFinalUsd).toBe('50');
  });

  it('nuevaVersion incrementa numeroVersion y NO afecta a tenants ya contratados', async () => {
    await registerOficial(providerOk('4000'));
    const plan = await createPlan({ nombre: 'Versionable', limites, precio: 50 });
    const tenant = await crearTenant('empresa-version');
    await assignPlanToTenant(tenant._id.toString(), plan._id);

    // Cambia la tasa vigente (tasa manual) y se genera una nueva versión del plan.
    await registerManual({ valorCopPorUsd: '5000', fechaVigencia: new Date(), motivo: 'ajuste' }, 'u1');
    const v2 = await nuevaVersionPlan(plan._id);
    expect(v2.numeroVersion).toBe(2);
    expect(v2.fotografiaFinanciera?.trmOficial).toBe('5000'); // el plan sí se recalcula

    // El tenant contratado conserva su fotografía v1.
    const releido = await Tenant.findById(tenant._id).lean();
    expect(releido?.fotografiaFinancieraContratada?.trmOficial).toBe('4000');
    expect(releido?.planContratadoVersion).toBe(1);
  });
});
