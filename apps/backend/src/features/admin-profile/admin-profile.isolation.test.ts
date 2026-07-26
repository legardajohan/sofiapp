import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { findScoped } from '../../repositories/base.repository.js';
import { AdminProfile } from './admin-profile.model.js';
import {
  createAdminProfile,
  listAdminProfiles,
  updateAdminProfile,
  deleteAdminProfile,
} from './admin-profile.service.js';
import type { IAdminProfileDocument } from './admin-profile.types.js';

// Test de aislamiento multi-tenant obligatorio (docs/multi-tenancy.md §8).
describe('admin-profile — aislamiento multi-tenant (Fase B)', () => {
  const tenantA = new Types.ObjectId().toString();
  const tenantB = new Types.ObjectId().toString();

  it('una etiqueta de A no es visible ni contable con el scope de B', async () => {
    await createAdminProfile(tenantA, { nombre: 'Etiqueta A' });

    expect(await listAdminProfiles(tenantA)).toHaveLength(1);
    expect(await listAdminProfiles(tenantB)).toHaveLength(0);

    const docsB = await findScoped(AdminProfile, tenantB, {}).lean<IAdminProfileDocument[]>();
    expect(docsB).toHaveLength(0);
  });

  it('B no puede actualizar ni eliminar una etiqueta de A (404 por scope)', async () => {
    const deA = await createAdminProfile(tenantA, { nombre: 'Solo de A' });

    await expect(
      updateAdminProfile(tenantB, deA._id, { activo: false }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(deleteAdminProfile(tenantB, deA._id)).rejects.toMatchObject({ statusCode: 404 });

    // La etiqueta de A sigue intacta y activa.
    const [aunViva] = await listAdminProfiles(tenantA);
    expect(aunViva?.activo).toBe(true);
  });

  it('dos tenants pueden tener una etiqueta con el mismo nombre', async () => {
    await createAdminProfile(tenantA, { nombre: 'Coordinador regional' });
    await expect(
      createAdminProfile(tenantB, { nombre: 'Coordinador regional' }),
    ).resolves.toMatchObject({ nombre: 'Coordinador regional' });
  });
});
