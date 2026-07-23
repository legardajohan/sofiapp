import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import {
  getBaseProfiles,
  listAdminProfiles,
  createAdminProfile,
  updateAdminProfile,
  deleteAdminProfile,
} from './admin-profile.service.js';

const tenantId = new Types.ObjectId().toString();

describe('admin-profile.service — Fase B', () => {
  describe('getBaseProfiles', () => {
    it('devuelve el catálogo base global (5 perfiles con key y nombre)', () => {
      const base = getBaseProfiles();
      expect(base).toHaveLength(5);
      expect(base.map((p) => p.key)).toContain('vendedor');
      expect(base.find((p) => p.key === 'asesor_comercial')?.nombre).toBe('Asesor comercial');
    });
  });

  describe('CRUD de etiquetas propias (tenant-scoped)', () => {
    it('crea una etiqueta propia y la lista', async () => {
      const creada = await createAdminProfile(tenantId, { nombre: 'Vendedor de electrodomésticos' });
      expect(creada._id).toBeDefined();
      expect(creada.activo).toBe(true);

      const lista = await listAdminProfiles(tenantId);
      expect(lista).toHaveLength(1);
      expect(lista[0]?.nombre).toBe('Vendedor de electrodomésticos');
    });

    it('rechaza (409) una etiqueta duplicada dentro del mismo tenant', async () => {
      await createAdminProfile(tenantId, { nombre: 'Repartidor' });
      await expect(createAdminProfile(tenantId, { nombre: 'Repartidor' })).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('actualiza una etiqueta existente', async () => {
      const creada = await createAdminProfile(tenantId, { nombre: 'Temporal' });
      const actualizada = await updateAdminProfile(tenantId, creada._id, { activo: false });
      expect(actualizada.activo).toBe(false);
    });

    it('lanza 404 al actualizar/eliminar una etiqueta inexistente', async () => {
      const fakeId = new Types.ObjectId().toString();
      await expect(updateAdminProfile(tenantId, fakeId, { activo: false })).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(deleteAdminProfile(tenantId, fakeId)).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
