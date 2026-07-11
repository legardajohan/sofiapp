import { describe, it, expect } from 'vitest';
import { Plan } from './plan.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import { createPlan, updatePlan, getPlanLimits } from './plan.service.js';
import { assignPlanToTenant } from '../tenant/tenant.service.js';

const limites = { usuarios: 3, mensajesMes: 1000, leads: 500, campanasMes: 2 };

async function crearPlan(nombre: string, activo = true) {
  return Plan.create({ nombre, limites, precio: 100, activo });
}

async function crearTenant(slug: string, planId?: string) {
  return Tenant.create({
    nombre: `T ${slug}`,
    slug,
    contacto: { email: `${slug}@t.com`, telefono: '3000000000' },
    estado: 'activo',
    ...(planId ? { planId } : {}),
  });
}

describe('plan.service — HU-SAAS-02', () => {
  describe('createPlan', () => {
    it('crea un plan con límites y precio', async () => {
      const plan = await createPlan({ nombre: 'Básico', limites, precio: 0 });
      expect(plan._id).toBeDefined();
      expect(plan.limites.leads).toBe(500);
      expect(plan.activo).toBe(true);
    });

    it('lanza AppError 409 si el nombre ya existe', async () => {
      await createPlan({ nombre: 'Pro', limites, precio: 0 });
      await expect(createPlan({ nombre: 'Pro', limites, precio: 0 })).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe('updatePlan', () => {
    it('lanza AppError 404 si el plan no existe', async () => {
      await expect(
        updatePlan('507f1f77bcf86cd799439011', { precio: 50 })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('actualiza un límite sin pisar el resto del subdocumento', async () => {
      const created = await createPlan({ nombre: 'Estándar', limites, precio: 0 });
      const updated = await updatePlan(created._id, { limites: { mensajesMes: 9999 } });
      expect(updated.limites.mensajesMes).toBe(9999);
      expect(updated.limites.leads).toBe(500); // intacto
    });
  });

  describe('getPlanLimits', () => {
    it('retorna null si el planId es null', async () => {
      expect(await getPlanLimits(null)).toBeNull();
    });

    it('retorna null si el plan está inactivo', async () => {
      const plan = await crearPlan('Inactivo', false);
      expect(await getPlanLimits(plan._id.toString())).toBeNull();
    });

    it('retorna los límites de un plan activo', async () => {
      const plan = await crearPlan('Activo', true);
      const result = await getPlanLimits(plan._id.toString());
      expect(result?.usuarios).toBe(3);
    });
  });

  describe('assignPlanToTenant', () => {
    it('asigna un plan activo a la empresa', async () => {
      const plan = await crearPlan('AsignableActivo');
      const tenant = await crearTenant('empresa-asignar');
      const result = await assignPlanToTenant(tenant._id.toString(), plan._id.toString());
      expect(result.planId).toBe(plan._id.toString());
    });

    it('lanza AppError 409 si el plan está inactivo', async () => {
      const plan = await crearPlan('AsignableInactivo', false);
      const tenant = await crearTenant('empresa-inactivo-plan');
      await expect(
        assignPlanToTenant(tenant._id.toString(), plan._id.toString())
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('lanza AppError 404 si la empresa no existe', async () => {
      const plan = await crearPlan('AsignableSinTenant');
      await expect(
        assignPlanToTenant('507f1f77bcf86cd799439011', plan._id.toString())
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
