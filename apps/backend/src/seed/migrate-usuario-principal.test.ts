import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Tenant } from '../features/tenant/tenant.model.js';
import { User } from '../features/users/user.model.js';
import { crearUsuario } from '../features/users/user.test-helpers.js';
import { migrarPrincipalTenant, migrarUsuarioPrincipal } from './migrate-usuario-principal.js';

// AUTH-05, criterio 3: marca al principal de las empresas existentes.

async function crearTenant(slug: string): Promise<string> {
  const t = await Tenant.create({
    nombre: slug, slug, contacto: { email: `${slug}@t.com`, telefono: '3000000000' }, estado: 'activo',
  });
  return t._id.toString();
}

async function principalDe(tenantId: string): Promise<string[]> {
  const docs = await User.find({ tenantId: new Types.ObjectId(tenantId), esPrincipal: true }).lean();
  return docs.map((d) => String(d._id));
}

describe('migrate-usuario-principal (AUTH-05)', () => {
  it('dry-run no escribe y reporta al Administrador activo más antiguo', async () => {
    const t = await crearTenant('dry');
    await crearUsuario(t, { rolEmpresa: 'asesor' });
    const primero = await crearUsuario(t, { email: 'primero@t.com' });
    await crearUsuario(t);
    const rep = await migrarPrincipalTenant(t);
    expect(rep).toEqual({ tenantId: t, estado: 'a_marcar', userId: primero.id, email: 'primero@t.com' });
    expect(await principalDe(t)).toEqual([]);
  });

  it('--apply marca al más antiguo (ignora inactivos) y es idempotente', async () => {
    const t = await crearTenant('apply');
    await crearUsuario(t, { activo: false });
    const activo = await crearUsuario(t);
    await crearUsuario(t);
    expect((await migrarPrincipalTenant(t, { apply: true })).estado).toBe('marcado');
    expect(await principalDe(t)).toEqual([activo.id]);
    expect((await migrarPrincipalTenant(t, { apply: true })).estado).toBe('ya_tiene');
    expect(await principalDe(t)).toEqual([activo.id]);
  });

  it('reporta empresas sin Administrador y solo toca su propio tenant', async () => {
    const sinAdmin = await crearTenant('sin-admin');
    await crearUsuario(sinAdmin, { rolEmpresa: 'coordinador' });
    const conAdmin = await crearTenant('con-admin');
    const admin = await crearUsuario(conAdmin);
    const reportes = await migrarUsuarioPrincipal({ apply: true });
    const porTenant = new Map(reportes.map((r) => [r.tenantId, r.estado]));
    expect(porTenant.get(sinAdmin)).toBe('sin_administrador');
    expect(porTenant.get(conAdmin)).toBe('marcado');
    expect(await principalDe(sinAdmin)).toEqual([]);
    expect(await principalDe(conAdmin)).toEqual([admin.id]);
  });
});
