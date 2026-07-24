import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { UserModel } from './user.model.js';
import { listTenantUsers } from './user.service.js';

// Test de aislamiento multi-tenant obligatorio (docs/multi-tenancy.md §8) — HU-OMNI-02.
describe('users — aislamiento multi-tenant (GET /api/users)', () => {
  const tenantA = new Types.ObjectId().toString();
  const tenantB = new Types.ObjectId().toString();

  it('solo devuelve admins activos del propio tenant', async () => {
    await UserModel.create({
      tenantId: new Types.ObjectId(tenantA),
      nombre: 'A1',
      email: 'a1@t.com',
      passwordHash: 'hash',
      rol: 'admin',
      activo: true,
    });
    await UserModel.create({
      tenantId: new Types.ObjectId(tenantA),
      nombre: 'A2 inactivo',
      email: 'a2@t.com',
      passwordHash: 'hash',
      rol: 'admin',
      activo: false,
    });
    await UserModel.create({
      tenantId: new Types.ObjectId(tenantB),
      nombre: 'B1',
      email: 'b1@t.com',
      passwordHash: 'hash',
      rol: 'admin',
      activo: true,
    });

    const result = await listTenantUsers(tenantA, { activo: true, rol: 'admin' });
    expect(result).toHaveLength(1);
    expect(result[0]?.nombre).toBe('A1');
  });

  it('nunca devuelve passwordHash', async () => {
    await UserModel.create({
      tenantId: new Types.ObjectId(tenantA),
      nombre: 'A1',
      email: 'ax@t.com',
      passwordHash: 'super-secreto',
      rol: 'admin',
      activo: true,
    });

    const result = await listTenantUsers(tenantA, { activo: true, rol: 'admin' });
    expect(result[0]).not.toHaveProperty('passwordHash');
  });

  it('nunca devuelve al superadmin (tenantId null)', async () => {
    await UserModel.create({
      tenantId: null,
      nombre: 'Root',
      email: 'root@t.com',
      passwordHash: 'hash',
      rol: 'superadmin',
      activo: true,
    });
    await UserModel.create({
      tenantId: new Types.ObjectId(tenantA),
      nombre: 'A1',
      email: 'a1b@t.com',
      passwordHash: 'hash',
      rol: 'admin',
      activo: true,
    });

    const result = await listTenantUsers(tenantA, { activo: true, rol: 'admin' });
    expect(result.every((u) => u.rol === 'admin')).toBe(true);
    expect(result.some((u) => u.nombre === 'Root')).toBe(false);
  });
});
