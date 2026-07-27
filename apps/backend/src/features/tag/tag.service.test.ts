import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Tag } from './tag.model.js';
import { createTag, deleteTag, findTagsByIds, listTags, updateTag } from './tag.service.js';
import { seedSemaforoTags } from '../../seed/seed-semaforo-tags.js';
import type { IClienteDocument } from '../cliente/cliente.types.js';

const tenant = new Types.ObjectId();
const otroTenant = new Types.ObjectId();

describe('tag.service — CRUD por tenant', () => {
  beforeEach(async () => {
    await Tag.deleteMany({});
    await Cliente.deleteMany({});
    // Los índices únicos con collation deben existir antes de probar la unicidad.
    await Tag.syncIndexes();
  });

  it('crea una etiqueta y la devuelve normalizada', async () => {
    const tag = await createTag(tenant, { nombre: '  Urgente  ', color: '#DC2626' });
    expect(tag.nombre).toBe('Urgente');
    expect(tag.color).toBe('#DC2626');
    expect(tag.semaforo).toBeNull();
  });

  it('rechaza con 409 un nombre repetido ignorando mayúsculas y acentos', async () => {
    await createTag(tenant, { nombre: 'Urgente', color: '#DC2626' });

    await expect(createTag(tenant, { nombre: 'urgente', color: '#2563EB' })).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(createTag(tenant, { nombre: 'URGENTE', color: '#2563EB' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('permite el mismo nombre en tenants distintos', async () => {
    await createTag(tenant, { nombre: 'Urgente', color: '#DC2626' });
    await expect(
      createTag(otroTenant, { nombre: 'Urgente', color: '#DC2626' }),
    ).resolves.toMatchObject({ nombre: 'Urgente' });
  });

  it('listTags ordena por nombre', async () => {
    await createTag(tenant, { nombre: 'Zeta', color: '#DC2626' });
    await createTag(tenant, { nombre: 'alfa', color: '#2563EB' });

    expect((await listTags(tenant)).map((t) => t.nombre)).toEqual(['alfa', 'Zeta']);
  });

  it('findTagsByIds resuelve en lote y omite ids inexistentes', async () => {
    const a = await createTag(tenant, { nombre: 'A', color: '#2563EB' });
    const fantasma = new Types.ObjectId().toString();

    const mapa = await findTagsByIds(tenant, [a.id, fantasma, a.id]);
    expect(mapa.size).toBe(1);
    expect(mapa.get(a.id)?.nombre).toBe('A');
  });

  it('deleteTag la retira de las conversaciones que la tenían', async () => {
    const tag = await createTag(tenant, { nombre: 'Temporal', color: '#EA580C' });
    const otra = await createTag(tenant, { nombre: 'Permanente', color: '#16A34A' });

    const cliente = await createScoped(Cliente, tenant, {
      metaUserId: 'wa_delete_tag',
      telefono: '573001112233',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tagIds: [new Types.ObjectId(tag.id), new Types.ObjectId(otra.id)],
    });

    await deleteTag(tenant, tag.id);

    const doc = await findByIdScoped(Cliente, tenant, String(cliente._id)).lean<IClienteDocument>();
    expect((doc?.tagIds ?? []).map(String)).toEqual([otra.id]);
  });
});

describe('tag.service — etiquetas de semaforización', () => {
  beforeEach(async () => {
    await Tag.deleteMany({});
    await Tag.syncIndexes();
    await seedSemaforoTags(tenant);
  });

  it('siembra las cuatro con su slug estable', async () => {
    const tags = await listTags(tenant);
    expect(tags.filter((t) => t.semaforo !== null)).toHaveLength(4);
    expect(new Set(tags.map((t) => t.semaforo))).toEqual(
      new Set(['azul', 'rojo', 'naranja', 'verde', null].filter((s) => s !== null)),
    );
  });

  it('sembrar dos veces no duplica ni pisa un renombrado del administrador', async () => {
    const verde = (await listTags(tenant)).find((t) => t.semaforo === 'verde')!;
    await updateTag(tenant, verde.id, { nombre: 'Va bien', color: '#00FF00' });

    await seedSemaforoTags(tenant);

    const tags = await listTags(tenant);
    expect(tags).toHaveLength(4);
    const despues = tags.find((t) => t.semaforo === 'verde')!;
    expect(despues.nombre).toBe('Va bien');
    expect(despues.color).toBe('#00FF00');
  });

  it('renombrar una de semáforo conserva su slug', async () => {
    const rojo = (await listTags(tenant)).find((t) => t.semaforo === 'rojo')!;
    const actualizada = await updateTag(tenant, rojo.id, { nombre: 'Perdida' });
    expect(actualizada.semaforo).toBe('rojo');
  });

  it('no se pueden borrar: son el vocabulario compartido con otros módulos', async () => {
    const azul = (await listTags(tenant)).find((t) => t.semaforo === 'azul')!;
    await expect(deleteTag(tenant, azul.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(await listTags(tenant)).toHaveLength(4);
  });
});
