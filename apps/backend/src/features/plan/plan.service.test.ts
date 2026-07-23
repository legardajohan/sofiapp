import { describe, it, expect } from 'vitest';
import { Plan } from './plan.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import { createPlan, updatePlan, listPlans, getPlanLimits, deletePlan } from './plan.service.js';
import { createPlanSchema } from './plan.validation.js';
import { assignPlanToTenant } from '../tenant/tenant.service.js';
import { updateSettings } from '../platform-settings/platform-settings.service.js';

const limites = { usuarios: 3, administradores: 3, mensajesMes: 1000, leads: 500, campanasMes: 2 };

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
      const plan = await createPlan({ nombre: 'Básico', periodicidad: 'mensual', limites, precio: 0 });
      expect(plan._id).toBeDefined();
      expect(plan.limites.leads).toBe(500);
      expect(plan.activo).toBe(true);
    });

    it('lanza AppError 409 si el nombre ya existe', async () => {
      await createPlan({ nombre: 'Pro', periodicidad: 'mensual', limites, precio: 0 });
      await expect(
        createPlan({ nombre: 'Pro', periodicidad: 'mensual', limites, precio: 0 }),
      ).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe('listPlans', () => {
    it('sin filtro devuelve todos los planes ordenados por precio', async () => {
      await crearPlan('ListPlanBarato');
      await crearPlan('ListPlanCaro');
      await Plan.updateOne({ nombre: 'ListPlanCaro' }, { precio: 500 });

      const planes = await listPlans();
      const nombres = planes.map((p) => p.nombre);
      expect(nombres).toContain('ListPlanBarato');
      expect(nombres).toContain('ListPlanCaro');
      expect(planes[0]!.precio).toBeLessThanOrEqual(planes[planes.length - 1]!.precio);
    });

    it('filtra por activo=true y activo=false correctamente', async () => {
      await crearPlan('ListActivoQA', true);
      await crearPlan('ListInactivoQA', false);

      const activos = await listPlans({ activo: true });
      expect(activos.some((p) => p.nombre === 'ListActivoQA')).toBe(true);
      expect(activos.some((p) => p.nombre === 'ListInactivoQA')).toBe(false);

      const inactivos = await listPlans({ activo: false });
      expect(inactivos.some((p) => p.nombre === 'ListInactivoQA')).toBe(true);
      expect(inactivos.some((p) => p.nombre === 'ListActivoQA')).toBe(false);
    });
  });

  describe('updatePlan', () => {
    it('lanza AppError 404 si el plan no existe', async () => {
      await expect(
        updatePlan('507f1f77bcf86cd799439011', { precio: 50 })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('actualiza un límite sin pisar el resto del subdocumento', async () => {
      const created = await createPlan({ nombre: 'Estándar', periodicidad: 'mensual', limites, precio: 0 });
      const updated = await updatePlan(created._id, { limites: { mensajesMes: 9999 } });
      expect(updated.limites.mensajesMes).toBe(9999);
      expect(updated.limites.leads).toBe(500); // intacto
    });
  });

  describe('administradores (Fase A)', () => {
    it('permite cantidades variables dentro del máximo global (3, 10, 20)', async () => {
      await updateSettings({ maxAdministradoresPorPlan: 100 });
      for (const [i, n] of [3, 10, 20].entries()) {
        const plan = await createPlan({
          nombre: `Var${i}`,
          periodicidad: 'mensual',
          limites: { ...limites, administradores: n },
          precio: 0,
        });
        expect(plan.limites.administradores).toBe(n);
      }
    });

    it('rechaza con 422 cuando administradores supera el máximo técnico global', async () => {
      await updateSettings({ maxAdministradoresPorPlan: 5 });
      await expect(
        createPlan({
          nombre: 'Excede',
          periodicidad: 'mensual',
          limites: { ...limites, administradores: 10 },
          precio: 0,
        }),
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it('la validación Zod exige administradores ≥ 1', () => {
      const bad = createPlanSchema.safeParse({
        body: { nombre: 'Cero', limites: { ...limites, administradores: 0 }, precio: 0 },
      });
      expect(bad.success).toBe(false);
    });
  });

  describe('perfilesPermitidos (Fase B)', () => {
    it('guarda los perfiles base habilitados en el plan', async () => {
      const plan = await createPlan({
        nombre: 'ConPerfiles',
        periodicidad: 'mensual',
        limites,
        perfilesPermitidos: ['vendedor', 'coordinador'],
        precio: 0,
      });
      expect(plan.perfilesPermitidos).toEqual(['vendedor', 'coordinador']);
    });

    it('cambiar perfilesPermitidos NO altera limites.administradores', async () => {
      const created = await createPlan({
        nombre: 'PerfilesVsAdmins',
        periodicidad: 'mensual',
        limites: { ...limites, administradores: 7 },
        perfilesPermitidos: ['vendedor'],
        precio: 0,
      });
      const updated = await updatePlan(created._id, {
        perfilesPermitidos: ['vendedor', 'asesor_comercial', 'coordinador', 'director', 'gerente'],
      });
      expect(updated.perfilesPermitidos).toHaveLength(5);
      expect(updated.limites.administradores).toBe(7); // intacto: perfiles ≠ cantidad de admins
    });

    it('la validación Zod rechaza una key fuera de PERFILES_BASE', () => {
      const bad = createPlanSchema.safeParse({
        body: { nombre: 'Malo', limites, perfilesPermitidos: ['inexistente'], precio: 0 },
      });
      expect(bad.success).toBe(false);
    });
  });

  describe('deletePlan', () => {
    it('elimina un plan que no está asignado a ninguna empresa', async () => {
      const plan = await crearPlan('Borrable');
      await deletePlan(plan._id.toString());
      expect(await Plan.findById(plan._id)).toBeNull();
    });

    it('lanza 404 si el plan no existe', async () => {
      await expect(deletePlan('507f1f77bcf86cd799439011')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lanza 409 si alguna empresa tiene el plan asignado', async () => {
      const plan = await crearPlan('EnUso');
      await crearTenant('empresa-con-plan', plan._id.toString());
      await expect(deletePlan(plan._id.toString())).rejects.toMatchObject({ statusCode: 409 });
      expect(await Plan.findById(plan._id)).not.toBeNull(); // no se borró
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
