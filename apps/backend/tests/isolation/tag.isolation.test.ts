import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped } from '../../src/repositories/base.repository.js';
import { Cliente } from '../../src/features/cliente/cliente.model.js';
import { Tag } from '../../src/features/tag/tag.model.js';
import {
  assertTagsDelTenant,
  deleteTag,
  listTags,
  updateTag,
} from '../../src/features/tag/tag.service.js';
import {
  listConversations,
  setConversationTags,
} from '../../src/features/conversation/conversation.service.js';
import { AppError } from '../../src/utils/AppError.js';
import type { IClienteDocument } from '../../src/features/cliente/cliente.types.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();
const asesorB = new Types.ObjectId();

async function crearTag(tenantId: Types.ObjectId, nombre: string): Promise<string> {
  const doc = await createScoped(Tag, tenantId, { nombre, color: '#2563EB' });
  return String(doc._id);
}

async function crearCliente(tenantId: Types.ObjectId, metaUserId: string): Promise<string> {
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId,
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
  });
  return String(doc._id);
}

const queryBase = { page: 1, limit: 20, filtro: 'todos' as const };

describe('HU-OMNI-04 — aislamiento multi-tenant de etiquetas', () => {
  let tagA: string;

  beforeEach(async () => {
    await Tag.deleteMany({});
    await Cliente.deleteMany({});
    tagA = await crearTag(tenantA, 'Solo de A');
  });

  it('listTags del tenantB no incluye las etiquetas del tenantA', async () => {
    const deB = await listTags(tenantB);
    expect(deB).toHaveLength(0);

    const deA = await listTags(tenantA);
    expect(deA.map((t) => t.nombre)).toEqual(['Solo de A']);
  });

  it('updateTag del tenantB sobre una etiqueta del tenantA → 404 y no la modifica', async () => {
    await expect(updateTag(tenantB, tagA, { nombre: 'Secuestrada' })).rejects.toMatchObject({
      statusCode: 404,
    });

    const intacta = await findByIdScoped(Tag, tenantA, tagA).lean();
    expect(intacta?.nombre).toBe('Solo de A');
  });

  it('deleteTag del tenantB sobre una etiqueta del tenantA → 404 y no la borra', async () => {
    await expect(deleteTag(tenantB, tagA)).rejects.toMatchObject({ statusCode: 404 });

    const sigue = await findByIdScoped(Tag, tenantA, tagA).lean();
    expect(sigue).not.toBeNull();
  });

  it('assertTagsDelTenant rechaza un id de otro tenant', async () => {
    await expect(assertTagsDelTenant(tenantB, [tagA])).rejects.toBeInstanceOf(AppError);
    await expect(assertTagsDelTenant(tenantA, [tagA])).resolves.toBeUndefined();
  });

  it('aplicar una etiqueta del tenantA a una conversación del tenantB falla SIN escribir', async () => {
    const clienteB = await crearCliente(tenantB, 'wa_tag_iso_b');

    await expect(
      setConversationTags(tenantB.toString(), clienteB, [tagA]),
    ).rejects.toMatchObject({ statusCode: 422 });

    // La comprobación que importa: el rechazo no dejó un id ajeno a medio escribir.
    const doc = await findByIdScoped(Cliente, tenantB, clienteB).lean<IClienteDocument>();
    expect(doc?.tagIds ?? []).toHaveLength(0);
  });

  it('filtrar la bandeja del tenantB por una etiqueta del tenantA devuelve vacío', async () => {
    await crearCliente(tenantB, 'wa_tag_iso_filtro');

    const resultado = await listConversations(tenantB.toString(), asesorB.toString(), {
      ...queryBase,
      etiqueta: tagA,
    });

    expect(resultado.total).toBe(0);
    expect(resultado.data).toHaveLength(0);
  });

  it('una conversación del tenantA no ve etiquetas del tenantB con el mismo nombre', async () => {
    const tagB = await crearTag(tenantB, 'Solo de A'); // mismo nombre, otro tenant: permitido
    const clienteA = await crearCliente(tenantA, 'wa_tag_iso_a');

    await setConversationTags(tenantA.toString(), clienteA, [tagA]);

    const bandejaA = await listConversations(tenantA.toString(), asesorB.toString(), queryBase);
    const ids = bandejaA.data[0]?.tags.map((t) => t.id) ?? [];
    expect(ids).toEqual([tagA]);
    expect(ids).not.toContain(tagB);
  });
});
