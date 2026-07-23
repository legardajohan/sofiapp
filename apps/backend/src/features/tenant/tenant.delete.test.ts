import { describe, it, expect } from 'vitest';
import { Tenant } from './tenant.model.js';
import { UserModel } from '../users/user.model.js';
import { TenantUsage } from '../usage/usage.model.js';
import { AdminProfile } from '../admin-profile/admin-profile.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { createTenant, deleteTenant } from './tenant.service.js';
import { getCurrentPeriodo } from '../usage/usage.service.js';

// Siembra datos tenant-scoped variados para una empresa.
async function sembrarDatos(tenantId: string): Promise<void> {
  await UserModel.create({
    tenantId,
    nombre: 'U',
    email: `u-${tenantId}@t.com`,
    passwordHash: 'hash',
    rol: 'admin',
    activo: true,
  });
  await TenantUsage.create({ tenantId, periodo: getCurrentPeriodo(), mensajesMes: 3, campanasMes: 1 });
  await AdminProfile.create({ tenantId, nombre: 'Etiqueta', activo: true });
  await Cliente.create({
    tenantId,
    metaUserId: `wa-${tenantId}`,
    telefono: '3001112222',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tags: [],
  });
}

async function conteosDe(tenantId: string): Promise<Record<string, number>> {
  const [users, usage, perfiles, clientes] = await Promise.all([
    UserModel.countDocuments({ tenantId }),
    TenantUsage.countDocuments({ tenantId }),
    AdminProfile.countDocuments({ tenantId }),
    Cliente.countDocuments({ tenantId }),
  ]);
  return { users, usage, perfiles, clientes };
}

describe('tenant.service.deleteTenant — eliminación en cascada', () => {
  it('lanza 404 si la empresa no existe', async () => {
    await expect(deleteTenant('507f1f77bcf86cd799439011')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('elimina la empresa y TODOS sus datos tenant-scoped', async () => {
    const empresa = await createTenant({
      nombre: 'A Eliminar',
      slug: 'a-eliminar',
      contacto: { email: 'a@t.com', telefono: '3000000000' },
    });
    await sembrarDatos(empresa._id);
    expect(await conteosDe(empresa._id)).toEqual({ users: 1, usage: 1, perfiles: 1, clientes: 1 });

    await deleteTenant(empresa._id);

    expect(await Tenant.findById(empresa._id)).toBeNull();
    expect(await conteosDe(empresa._id)).toEqual({ users: 0, usage: 0, perfiles: 0, clientes: 0 });
  });

  it('NO afecta los datos de otra empresa (aislamiento)', async () => {
    const a = await createTenant({
      nombre: 'A',
      slug: 'a-iso',
      contacto: { email: 'a2@t.com', telefono: '3000000001' },
    });
    const b = await createTenant({
      nombre: 'B',
      slug: 'b-iso',
      contacto: { email: 'b2@t.com', telefono: '3000000002' },
    });
    await sembrarDatos(a._id);
    await sembrarDatos(b._id);

    await deleteTenant(a._id);

    expect(await Tenant.findById(b._id)).not.toBeNull();
    expect(await conteosDe(b._id)).toEqual({ users: 1, usage: 1, perfiles: 1, clientes: 1 });
  });
});
