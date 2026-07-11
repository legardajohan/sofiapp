import { describe, it, expect } from 'vitest';
import { Plan } from '../plan/plan.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import { UserModel } from '../users/user.model.js';
import { TenantUsage } from './usage.model.js';
import {
  getCurrentPeriodo,
  getMetricUsed,
  assertWithinQuota,
  incrementUsage,
  getTenantUsage,
} from './usage.service.js';

const limites = { usuarios: 2, administradores: 2, mensajesMes: 2, leads: 5, campanasMes: 1 };

async function crearTenantConPlan() {
  const plan = await Plan.create({ nombre: 'Básico', limites, precio: 0 });
  const tenant = await Tenant.create({
    nombre: 'Empresa',
    slug: 'empresa-quota',
    contacto: { email: 'q@t.com', telefono: '3000000000' },
    estado: 'activo',
    planId: plan._id,
  });
  return { plan, tenant };
}

describe('usage.service — HU-SAAS-02', () => {
  describe('getCurrentPeriodo', () => {
    it('formatea YYYY-MM en UTC', () => {
      expect(getCurrentPeriodo(new Date(Date.UTC(2026, 6, 8)))).toBe('2026-07');
    });
  });

  describe('incrementUsage', () => {
    it('crea el documento del periodo actual y suma', async () => {
      const { tenant } = await crearTenantConPlan();
      await incrementUsage(tenant._id.toString(), 'mensajesMes');
      await incrementUsage(tenant._id.toString(), 'mensajesMes');
      expect(await getMetricUsed(tenant._id.toString(), 'mensajesMes')).toBe(2);
    });

    it('los contadores de otro periodo no cuentan para el periodo actual (reinicio)', async () => {
      const { tenant } = await crearTenantConPlan();
      await TenantUsage.create({
        tenantId: tenant._id,
        periodo: '2000-01',
        mensajesMes: 999,
        campanasMes: 0,
      });
      expect(await getMetricUsed(tenant._id.toString(), 'mensajesMes')).toBe(0);
    });
  });

  describe('assertWithinQuota', () => {
    it('lanza 429 cuando mensajesMes alcanzó el límite', async () => {
      const { tenant } = await crearTenantConPlan();
      await TenantUsage.create({
        tenantId: tenant._id,
        periodo: getCurrentPeriodo(),
        mensajesMes: 2,
        campanasMes: 0,
      });
      await expect(
        assertWithinQuota(tenant._id.toString(), 'mensajesMes')
      ).rejects.toMatchObject({ statusCode: 429 });
    });

    it('no lanza cuando mensajesMes está por debajo del límite', async () => {
      const { tenant } = await crearTenantConPlan();
      await incrementUsage(tenant._id.toString(), 'mensajesMes'); // 1 < 2
      await expect(
        assertWithinQuota(tenant._id.toString(), 'mensajesMes')
      ).resolves.toBeUndefined();
    });

    it('cuenta usuarios activos del tenant y bloquea al alcanzar el límite', async () => {
      const { tenant } = await crearTenantConPlan();
      for (let i = 0; i < 2; i++) {
        await UserModel.create({
          tenantId: tenant._id,
          nombre: `U${i}`,
          email: `u${i}@empresa-quota.com`,
          passwordHash: 'hash',
          rol: 'asesor',
          activo: true,
        });
      }
      await expect(
        assertWithinQuota(tenant._id.toString(), 'usuarios')
      ).rejects.toMatchObject({ statusCode: 429 });
    });

    it('es no-op cuando el tenant no tiene plan asignado', async () => {
      const tenant = await Tenant.create({
        nombre: 'Sin Plan',
        slug: 'sin-plan',
        contacto: { email: 'sp@t.com', telefono: '3000000001' },
        estado: 'activo',
      });
      await expect(
        assertWithinQuota(tenant._id.toString(), 'mensajesMes')
      ).resolves.toBeUndefined();
      await expect(
        assertWithinQuota(tenant._id.toString(), 'usuarios')
      ).resolves.toBeUndefined();
    });
  });

  describe('métrica administradores', () => {
    it('cuenta solo usuarios con puesto (admin/coordinador/asesor) y bloquea al alcanzar el límite', async () => {
      const { tenant } = await crearTenantConPlan(); // administradores: 2
      // El superadmin es global y NO ocupa asiento: no debe contar.
      await UserModel.create({
        tenantId: tenant._id,
        nombre: 'Root',
        email: 'root@empresa-quota.com',
        passwordHash: 'hash',
        rol: 'superadmin',
        activo: true,
      });
      // Dos puestos ocupados (admin + coordinador) → alcanza el límite (2).
      await UserModel.create({
        tenantId: tenant._id,
        nombre: 'Ad',
        email: 'ad@empresa-quota.com',
        passwordHash: 'hash',
        rol: 'admin',
        activo: true,
      });
      await UserModel.create({
        tenantId: tenant._id,
        nombre: 'Co',
        email: 'co@empresa-quota.com',
        passwordHash: 'hash',
        rol: 'coordinador',
        activo: true,
      });
      expect(await getMetricUsed(tenant._id.toString(), 'administradores')).toBe(2);
      await expect(
        assertWithinQuota(tenant._id.toString(), 'administradores')
      ).rejects.toMatchObject({ statusCode: 429 });
    });

    it('es no-op cuando el tenant no tiene plan asignado', async () => {
      const tenant = await Tenant.create({
        nombre: 'Sin Plan Admin',
        slug: 'sin-plan-admin',
        contacto: { email: 'spa@t.com', telefono: '3000000009' },
        estado: 'activo',
      });
      await expect(
        assertWithinQuota(tenant._id.toString(), 'administradores')
      ).resolves.toBeUndefined();
    });
  });

  describe('getTenantUsage', () => {
    it('devuelve las 4 métricas con usado/limite/restante/porcentaje y el plan', async () => {
      const { plan, tenant } = await crearTenantConPlan();
      await incrementUsage(tenant._id.toString(), 'mensajesMes'); // 1 de 2

      const usage = await getTenantUsage(tenant._id.toString());
      expect(usage.plan?.nombre).toBe('Básico');
      expect(usage.plan?._id).toBe(plan._id.toString());
      expect(usage.periodo).toBe(getCurrentPeriodo());
      expect(usage.metrics.mensajesMes).toEqual({
        usado: 1,
        limite: 2,
        restante: 1,
        porcentaje: 50,
      });
      expect(usage.metrics.usuarios.limite).toBe(2);
      expect(usage.metrics.administradores.limite).toBe(2);
    });
  });
});
