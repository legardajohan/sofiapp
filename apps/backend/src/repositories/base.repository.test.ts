import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { UserModel } from '../features/users/user.model.js';
import {
  findScoped,
  findByIdScoped,
  createScoped,
} from './base.repository.js';

// Usamos UserModel porque tiene el campo `tenantId` requerido por el repositorio scoped

describe('base.repository — aislamiento multi-tenant (INF-02)', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();

  const userBase = {
    nombre: 'Test User',
    email: 'test@user.com',
    passwordHash: 'hash',
    rol: 'asesor' as const,
    activo: true,
  };

  it('findByIdScoped no devuelve documentos de otro tenant', async () => {
    // Creamos un user perteneciente a tenantB directamente (sin pasar por *Scoped)
    const doc = await UserModel.create({
      ...userBase,
      email: `b-${Date.now()}@user.com`,
      tenantId: tenantB,
    });

    // Buscamos ese doc usando tenantA → debe devolver null
    const result = await findByIdScoped(UserModel, tenantA, doc._id).exec();
    expect(result).toBeNull();
  });

  it('createScoped fuerza el tenantId del argumento sobre el del data', async () => {
    const doc = await createScoped(
      UserModel,
      tenantA,
      {
        ...userBase,
        email: `override-${Date.now()}@user.com`,
        tenantId: tenantB, // intentamos inyectar tenantB
      }
    );

    // El documento debe tener tenantA (forzado por createScoped)
    expect((doc as unknown as { tenantId: Types.ObjectId }).tenantId.toString()).toBe(
      tenantA.toString()
    );
  });

  it('findScoped nunca devuelve documentos de otro tenant', async () => {
    await UserModel.create([
      {
        ...userBase,
        email: `ua-${Date.now()}@user.com`,
        tenantId: tenantA,
      },
      {
        ...userBase,
        email: `ub-${Date.now()}@user.com`,
        tenantId: tenantB,
      },
    ]);

    const results = await findScoped(UserModel, tenantA).lean();
    const ids = results.map((r) => r.tenantId?.toString());
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id === tenantA.toString())).toBe(true);
  });
});
