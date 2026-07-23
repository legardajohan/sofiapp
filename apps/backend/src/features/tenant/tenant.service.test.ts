import { describe, it, expect } from 'vitest';
import { Tenant } from './tenant.model.js';
import { UserModel } from '../users/user.model.js';
import { Plan } from '../plan/plan.model.js';
import {
  createTenant,
  updateTenant,
  updateTenantStatus,
  deleteTenant,
} from './tenant.service.js';
import { AppError } from '../../utils/AppError.js';

describe('tenant.service — HU-SAAS-01', () => {
  describe('createTenant', () => {
    it('crea empresa sin adminUser', async () => {
      const result = await createTenant({
        nombre: 'Empresa Test',
        slug: 'empresa-test',
        contacto: { email: 'test@empresa.com', telefono: '3001234567' },
      });

      expect(result._id).toBeDefined();
      expect(result.nombre).toBe('Empresa Test');
      expect(result.estado).toBe('prueba');

      const users = await UserModel.find({});
      expect(users).toHaveLength(0);
    });

    it('crea empresa con adminUser — ambos persisten', async () => {
      const result = await createTenant({
        nombre: 'Empresa Con Admin',
        slug: 'empresa-con-admin',
        contacto: { email: 'admin@empresa.com', telefono: '3001234568' },
        adminUser: {
          nombre: 'Juan Admin',
          email: 'juan@empresa.com',
          password: 'password123',
        },
      });

      expect(result._id).toBeDefined();

      const user = await UserModel.findOne({ email: 'juan@empresa.com' }).lean();
      expect(user).not.toBeNull();
      expect(user!.rol).toBe('admin');
      expect(user!.tenantId?.toString()).toBe(result._id);
      expect(user!.activo).toBe(true);
    });

    it('rollback atómico si adminUser tiene email duplicado', async () => {
      // Pre-crear un usuario con ese email
      await UserModel.create({
        tenantId: null,
        nombre: 'Existente',
        email: 'duplicado@empresa.com',
        passwordHash: 'hash',
        rol: 'admin',
        activo: true,
      });

      await expect(
        createTenant({
          nombre: 'Empresa Rollback',
          slug: 'empresa-rollback',
          contacto: { email: 'rr@empresa.com', telefono: '3001234569' },
          adminUser: {
            nombre: 'Admin Dup',
            email: 'duplicado@empresa.com',
            password: 'password123',
          },
        })
      ).rejects.toThrow();

      // El tenant NO debe haberse persistido
      const tenant = await Tenant.findOne({ slug: 'empresa-rollback' }).lean();
      expect(tenant).toBeNull();
    });

    it('lanza AppError 429 si el plan asignado ya no admite más usuarios (HU-SAAS-02)', async () => {
      // Regresión: assertWithinQuota se llama DENTRO de la misma transacción que crea el tenant,
      // por lo que debe ver el documento aún no confirmado (requiere pasar la `session`).
      const plan = await Plan.create({
        nombre: 'CeroUsuarios',
        limites: { usuarios: 0, administradores: 1, mensajesMes: 10, leads: 10, campanasMes: 1 },
        precio: 0,
        activo: true,
      });

      await expect(
        createTenant({
          nombre: 'Empresa Sin Cupo',
          slug: 'empresa-sin-cupo',
          contacto: { email: 'cupo@empresa.com', telefono: '3001234580' },
          planId: plan._id.toString(),
          adminUser: { nombre: 'Admin Cupo', email: 'admincupo@empresa.com', password: 'password123' },
        })
      ).rejects.toMatchObject({ statusCode: 429 });

      // Rollback atómico: ni el tenant ni el usuario deben haberse persistido.
      const tenant = await Tenant.findOne({ slug: 'empresa-sin-cupo' }).lean();
      expect(tenant).toBeNull();
      const user = await UserModel.findOne({ email: 'admincupo@empresa.com' }).lean();
      expect(user).toBeNull();
    });

    it('lanza AppError 409 si slug ya existe', async () => {
      await createTenant({
        nombre: 'Empresa Slug',
        slug: 'slug-duplicado',
        contacto: { email: 'slug@empresa.com', telefono: '3001234570' },
      });

      await expect(
        createTenant({
          nombre: 'Empresa Slug 2',
          slug: 'slug-duplicado',
          contacto: { email: 'slug2@empresa.com', telefono: '3001234571' },
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('updateTenant', () => {
    it('lanza AppError 404 si el id no existe', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      await expect(updateTenant(fakeId, { nombre: 'Nuevo' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('actualiza campos editables correctamente', async () => {
      const created = await createTenant({
        nombre: 'Empresa Original',
        slug: 'empresa-original',
        contacto: { email: 'orig@empresa.com', telefono: '3001234572' },
      });

      const updated = await updateTenant(created._id, { nombre: 'Empresa Actualizada' });
      expect(updated.nombre).toBe('Empresa Actualizada');
    });

    it('quita el plan cuando planId es null (empresa queda sin plan)', async () => {
      const plan = await Plan.create({
        nombre: 'ParaQuitar',
        periodicidad: 'mensual',
        limites: { usuarios: 1, administradores: 1, mensajesMes: 1, leads: 1, campanasMes: 1 },
        precio: 0,
      });
      const created = await createTenant({
        nombre: 'ConPlan',
        slug: 'empresa-con-plan-quitar',
        contacto: { email: 'cpq@t.com', telefono: '3001234598' },
        planId: plan._id.toString(),
      });
      expect(created.planId).toBe(plan._id.toString());

      const updated = await updateTenant(created._id, { planId: null });
      expect(updated.planId).toBeUndefined();
    });

    it('planId undefined NO modifica el plan actual', async () => {
      const plan = await Plan.create({
        nombre: 'SeConserva',
        periodicidad: 'mensual',
        limites: { usuarios: 1, administradores: 1, mensajesMes: 1, leads: 1, campanasMes: 1 },
        precio: 0,
      });
      const created = await createTenant({
        nombre: 'MantienePlan',
        slug: 'empresa-mantiene-plan',
        contacto: { email: 'mp@t.com', telefono: '3001234597' },
        planId: plan._id.toString(),
      });

      const updated = await updateTenant(created._id, { nombre: 'Renombrada' });
      expect(updated.nombre).toBe('Renombrada');
      expect(updated.planId).toBe(plan._id.toString()); // plan intacto
    });
  });

  describe('bloqueo de empresa ACTIVA — editar y eliminar (HU-SAAS-02)', () => {
    async function crearEmpresaActiva(slug: string, nombre = `Empresa ${slug}`): Promise<string> {
      const created = await createTenant({
        nombre,
        slug,
        contacto: { email: `${slug}@t.com`, telefono: '3009999999' },
      });
      await updateTenantStatus(created._id, { estado: 'activo' });
      return created._id;
    }

    it('permite editar una empresa NO activa (prueba)', async () => {
      const created = await createTenant({
        nombre: 'Prueba Editable',
        slug: 'prueba-editable',
        contacto: { email: 'pe@t.com', telefono: '3001111111' },
      });
      const updated = await updateTenant(created._id, { nombre: 'Prueba Editada' });
      expect(updated.nombre).toBe('Prueba Editada');
    });

    it('permite eliminar una empresa NO activa (suspendida)', async () => {
      const created = await createTenant({
        nombre: 'Susp Borrable',
        slug: 'susp-borrable',
        contacto: { email: 'sb@t.com', telefono: '3002222222' },
      });
      await updateTenantStatus(created._id, { estado: 'activo' });
      await updateTenantStatus(created._id, { estado: 'suspendido' });
      await deleteTenant(created._id);
      expect(await Tenant.findById(created._id)).toBeNull();
    });

    it('IMPIDE editar (409 TENANT_ACTIVE) una empresa activa', async () => {
      const id = await crearEmpresaActiva('activa-edit');
      await expect(updateTenant(id, { nombre: 'X' })).rejects.toMatchObject({
        statusCode: 409,
        code: 'TENANT_ACTIVE',
      });
      expect((await Tenant.findById(id))!.nombre).toBe('Empresa activa-edit');
    });

    it('IMPIDE eliminar (409 TENANT_ACTIVE) una empresa activa y no la borra', async () => {
      const id = await crearEmpresaActiva('activa-del');
      await expect(deleteTenant(id)).rejects.toMatchObject({
        statusCode: 409,
        code: 'TENANT_ACTIVE',
      });
      expect(await Tenant.findById(id)).not.toBeNull();
    });

    it('el 409 incluye details (tenantName, estado)', async () => {
      const id = await crearEmpresaActiva('activa-detalle', 'Empresa Viva');
      await expect(deleteTenant(id)).rejects.toMatchObject({
        statusCode: 409,
        code: 'TENANT_ACTIVE',
        details: { tenantName: 'Empresa Viva', estado: 'activo' },
      });
    });

    it('tras SUSPENDER, permite editar y eliminar', async () => {
      const id = await crearEmpresaActiva('activa-luego-susp');
      await updateTenantStatus(id, { estado: 'suspendido' });
      const updated = await updateTenant(id, { nombre: 'Ya Editable' });
      expect(updated.nombre).toBe('Ya Editable');
      await deleteTenant(id);
      expect(await Tenant.findById(id)).toBeNull();
    });
  });

  describe('updateTenantStatus', () => {
    it('lanza AppError 409 si ya tiene el estado solicitado', async () => {
      const created = await createTenant({
        nombre: 'Empresa Status',
        slug: 'empresa-status',
        contacto: { email: 'status@empresa.com', telefono: '3001234573' },
      });

      // estado inicial es 'prueba' — intentar cambiar a 'prueba' lanza 409
      // (creamos en estado prueba, cambiamos a activo primero)
      await updateTenantStatus(created._id, { estado: 'activo' });

      await expect(
        updateTenantStatus(created._id, { estado: 'activo' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('cambia estado de prueba → activo → suspendido', async () => {
      const created = await createTenant({
        nombre: 'Empresa Toggle',
        slug: 'empresa-toggle',
        contacto: { email: 'toggle@empresa.com', telefono: '3001234574' },
      });

      const activo = await updateTenantStatus(created._id, { estado: 'activo' });
      expect(activo.estado).toBe('activo');

      const suspendido = await updateTenantStatus(created._id, { estado: 'suspendido' });
      expect(suspendido.estado).toBe('suspendido');
    });
  });
});
