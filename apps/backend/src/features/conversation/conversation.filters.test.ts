import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../cliente/cliente.model.js';
import { UserModel } from '../users/user.model.js';
import { listConversations } from './conversation.service.js';
import type { ListConversationsQuery } from './conversation.validation.js';

const tenantId = new Types.ObjectId().toString();

async function crearAdmin(nombre = 'Admin') {
  return UserModel.create({
    tenantId: new Types.ObjectId(tenantId),
    nombre,
    email: `admin-${new Types.ObjectId().toString()}@t.com`,
    passwordHash: 'hash',
    rol: 'admin',
    activo: true,
  });
}

async function crearCliente(overrides: Record<string, unknown> = {}) {
  return Cliente.create({
    tenantId: new Types.ObjectId(tenantId),
    metaUserId: `wa-${new Types.ObjectId().toString()}`,
    telefono: '3000000000',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tags: [],
    ...overrides,
  });
}

function query(overrides: Partial<ListConversationsQuery> = {}): ListConversationsQuery {
  return { page: 1, limit: 20, filtro: 'todos', ...overrides };
}

describe('conversation.service — filtros de bandeja (HU-OMNI-02)', () => {
  it('?asignadoA=<id> devuelve solo las conversaciones de ese responsable', async () => {
    const adminA = await crearAdmin('A');
    const adminB = await crearAdmin('B');
    const c1 = await crearCliente({ asesorId: adminA._id });
    await crearCliente({ asesorId: adminB._id });

    const result = await listConversations(
      tenantId,
      adminA._id.toString(),
      query({ asignadoA: adminA._id.toString() }),
    );
    expect(result.data.map((d) => d.id)).toEqual([c1._id.toString()]);
  });

  it('?asignadoA=sin_asignar devuelve solo las conversaciones sin responsable', async () => {
    const admin = await crearAdmin();
    await crearCliente({ asesorId: admin._id });
    const libre = await crearCliente();

    const result = await listConversations(
      tenantId,
      admin._id.toString(),
      query({ asignadoA: 'sin_asignar' }),
    );
    expect(result.data.map((d) => d.id)).toEqual([libre._id.toString()]);
  });

  it('?estado=<estadoComercial> filtra por estado comercial', async () => {
    await crearCliente({ estadoComercial: 'nuevo' });
    const gestion = await crearCliente({ estadoComercial: 'en_gestion' });

    const result = await listConversations(
      tenantId,
      new Types.ObjectId().toString(),
      query({ estado: 'en_gestion' }),
    );
    expect(result.data.map((d) => d.id)).toEqual([gestion._id.toString()]);
  });

  it('asignadoA y estado son combinables', async () => {
    const admin = await crearAdmin();
    const match = await crearCliente({ asesorId: admin._id, estadoComercial: 'pago_pendiente' });
    await crearCliente({ asesorId: admin._id, estadoComercial: 'nuevo' });
    await crearCliente({ estadoComercial: 'pago_pendiente' });

    const result = await listConversations(
      tenantId,
      admin._id.toString(),
      query({ asignadoA: admin._id.toString(), estado: 'pago_pendiente' }),
    );
    expect(result.data.map((d) => d.id)).toEqual([match._id.toString()]);
  });

  it('?filtro=mios sigue funcionando; asignadoA explícito gana sobre filtro', async () => {
    const self = new Types.ObjectId().toString();
    const other = await crearAdmin('Otro');
    const mine = await crearCliente({ asesorId: new Types.ObjectId(self) });
    const otherConv = await crearCliente({ asesorId: other._id });

    const soloMias = await listConversations(tenantId, self, query({ filtro: 'mios' }));
    expect(soloMias.data.map((d) => d.id)).toEqual([mine._id.toString()]);

    const conAsignadoA = await listConversations(
      tenantId,
      self,
      query({ filtro: 'mios', asignadoA: other._id.toString() }),
    );
    expect(conAsignadoA.data.map((d) => d.id)).toEqual([otherConv._id.toString()]);
  });
});

describe('conversation.service — exclusión de conversaciones demo (HU-OMNI-05)', () => {
  it('excluye clientes con metaUserId demo- y conserva los normales', async () => {
    const real = await crearCliente();
    await crearCliente({ metaUserId: 'demo-573001112233' });

    const result = await listConversations(
      tenantId,
      new Types.ObjectId().toString(),
      query({}),
    );
    expect(result.data.map((d) => d.id)).toEqual([real._id.toString()]);
    expect(result.total).toBe(1);
  });

  it('la exclusión demo se mantiene combinada con otros filtros', async () => {
    const admin = await crearAdmin();
    const match = await crearCliente({ asesorId: admin._id, estadoComercial: 'en_gestion' });
    await crearCliente({
      asesorId: admin._id,
      estadoComercial: 'en_gestion',
      metaUserId: 'demo-573001112233',
    });

    const result = await listConversations(
      tenantId,
      admin._id.toString(),
      query({ asignadoA: admin._id.toString(), estado: 'en_gestion' }),
    );
    expect(result.data.map((d) => d.id)).toEqual([match._id.toString()]);
    expect(result.total).toBe(1);
  });
});
