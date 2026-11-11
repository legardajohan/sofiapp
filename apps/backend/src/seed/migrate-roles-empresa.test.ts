import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Tenant } from '../features/tenant/tenant.model.js';
import { User } from '../features/users/user.model.js';
import { HandoffSettings } from '../features/ai/ai-handoff.model.js';
import { migrarRolesEmpresa, migrarRolesTenant } from './migrate-roles-empresa.js';

// Inserta usuarios "de antes de AUTH-04" saltándose el schema (que ya exige `rolEmpresa`).
async function legado(tenantId: Types.ObjectId, nombre: string, subrol?: string): Promise<Types.ObjectId> {
  const _id = new Types.ObjectId();
  await User.collection.insertOne({
    _id,
    tenantId,
    nombre,
    email: `${nombre}-${_id.toString()}@t.com`,
    passwordHash: 'h',
    rol: 'admin',
    activo: true,
    ...(subrol ? { subrol } : {}),
  });
  return _id;
}

async function crearTenant(slug: string): Promise<Types.ObjectId> {
  const t = await Tenant.create({
    nombre: slug, slug, contacto: { email: `${slug}@t.com`, telefono: '3000000000' }, estado: 'activo',
  });
  return t._id;
}

async function crudo(id: Types.ObjectId): Promise<Record<string, unknown> | null> {
  return User.collection.findOne({ _id: id });
}

describe('migrate-roles-empresa (AUTH-04, criterio 12)', () => {
  it('dry-run no escribe y reporta el rol resultante de cada usuario', async () => {
    const t = await crearTenant('dry');
    const prop = await legado(t, 'prop');
    await legado(t, 'dir', 'director');
    await legado(t, 'ger', 'manager');
    await legado(t, 'coo', 'coordinator');
    await legado(t, 'sec', 'secretary');

    const r = await migrarRolesTenant(t);
    expect(r.conteos).toEqual({ administrador: 3, coordinador: 1, asesor: 1 });
    expect(r.pendientes).toBe(5);
    expect((await crudo(prop))?.['rolEmpresa']).toBeUndefined();
  });

  it('--apply fija rolEmpresa y coordinadorId; una segunda pasada no cambia nada', async () => {
    const t = await crearTenant('apply');
    const coo = await legado(t, 'coo', 'coordinator');
    const sec = await legado(t, 'sec', 'secretary');

    await migrarRolesTenant(t, { apply: true });
    expect(await crudo(coo)).toMatchObject({ rolEmpresa: 'coordinador', coordinadorId: null, subrol: 'coordinator' });
    expect(await crudo(sec)).toMatchObject({ rolEmpresa: 'asesor' });

    const segunda = await migrarRolesTenant(t, { apply: true });
    expect(segunda.pendientes).toBe(0);
    expect(segunda.conteos).toEqual({ administrador: 0, coordinador: 1, asesor: 1 });
  });

  it('no pisa a un usuario que ya tiene rolEmpresa', async () => {
    const t = await crearTenant('respeta');
    const _id = new Types.ObjectId();
    await User.collection.insertOne({
      _id, tenantId: t, nombre: 'x', email: 'x@r.com', passwordHash: 'h', rol: 'admin',
      activo: true, subrol: 'director', rolEmpresa: 'asesor',
    });
    await migrarRolesTenant(t, { apply: true });
    expect((await crudo(_id))?.['rolEmpresa']).toBe('asesor');
  });

  it('--unset-legacy borra subrol', async () => {
    const t = await crearTenant('unset');
    const dir = await legado(t, 'dir', 'director');
    await migrarRolesTenant(t, { apply: true });
    const r = await migrarRolesTenant(t, { unsetLegacy: true });
    expect(r.conSubrolLegado).toBe(1);
    const doc = await crudo(dir);
    expect(doc?.['subrol']).toBeUndefined();
    expect(doc?.['rolEmpresa']).toBe('administrador');
  });

  it('solo toca usuarios del tenant que procesa', async () => {
    const a = await crearTenant('iso-a');
    const b = await crearTenant('iso-b');
    await legado(a, 'a1', 'secretary');
    const deB = await legado(b, 'b1', 'secretary');
    await migrarRolesTenant(a, { apply: true });
    expect((await crudo(deB))?.['rolEmpresa']).toBeUndefined();
    // La pasada global sí recorre todos los tenants.
    await migrarRolesEmpresa({ apply: true });
    expect((await crudo(deB))?.['rolEmpresa']).toBe('asesor');
  });

  it('reporta los destinos de transferencia que quedan apuntando a un no-asesor', async () => {
    const t = await crearTenant('destinos');
    const dir = await legado(t, 'dir', 'director');
    await HandoffSettings.collection.insertOne({ tenantId: t, asesorDestinoId: dir, activo: true });
    const r = await migrarRolesTenant(t);
    expect(r.destinosNoAsesor).toEqual([
      { origen: 'transferencia', userId: dir.toString(), nombre: 'dir', rolEmpresa: 'administrador' },
    ]);
  });
});
