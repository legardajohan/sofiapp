import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { findScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { UserModel } from '../users/user.model.js';
import { AuditEvent } from '../audit/audit.model.js';

// El puente de tiempo real no debe abrir Redis en tests (patrón de tests/unit/conversation.service.test.ts).
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const { assignConversation, listAssignments, listConversations } = await import(
  './conversation.service.js'
);

// Test de aislamiento multi-tenant obligatorio (docs/multi-tenancy.md §8) — HU-OMNI-02.
describe('conversation — aislamiento multi-tenant (asignación)', () => {
  const tenantA = new Types.ObjectId().toString();
  const tenantB = new Types.ObjectId().toString();

  async function crearAdmin(tenantId: string, nombre = 'Admin') {
    return UserModel.create({
      tenantId: new Types.ObjectId(tenantId),
      nombre,
      email: `admin-${new Types.ObjectId().toString()}@t.com`,
      passwordHash: 'hash',
      rol: 'admin',
      activo: true,
    });
  }

  async function crearCliente(tenantId: string) {
    return Cliente.create({
      tenantId: new Types.ObjectId(tenantId),
      metaUserId: `wa-${new Types.ObjectId().toString()}`,
      telefono: '3000000000',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tags: [],
    });
  }

  it('asignar una conversación de tenantA con token de tenantB → 404', async () => {
    const adminA = await crearAdmin(tenantA);
    const clienteA = await crearCliente(tenantA);

    await expect(
      assignConversation(
        tenantB,
        new Types.ObjectId().toString(),
        clienteA._id.toString(),
        adminA._id.toString(),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('leer el historial de una conversación de tenantA con token de tenantB → 404', async () => {
    const clienteA = await crearCliente(tenantA);
    await expect(
      listAssignments(tenantB, clienteA._id.toString(), { page: 1, limit: 20 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('tenantB no puede asignar un cliente propio a un usuario de tenantA', async () => {
    const adminA = await crearAdmin(tenantA);
    const clienteB = await crearCliente(tenantB);

    await expect(
      assignConversation(
        tenantB,
        new Types.ObjectId().toString(),
        clienteB._id.toString(),
        adminA._id.toString(),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('los audit_events de tenantA son invisibles para tenantB', async () => {
    const adminA = await crearAdmin(tenantA);
    const clienteA = await crearCliente(tenantA);
    await assignConversation(
      tenantA,
      new Types.ObjectId().toString(),
      clienteA._id.toString(),
      adminA._id.toString(),
    );

    const eventsB = await findScoped(AuditEvent, tenantB, {}).lean();
    expect(eventsB).toHaveLength(0);

    const eventsA = await findScoped(AuditEvent, tenantA, {}).lean();
    expect(eventsA).toHaveLength(1);
  });

  it('GET /conversations?asignadoA=<userId de tenantA> desde tenantB devuelve lista vacía', async () => {
    const adminA = await crearAdmin(tenantA);
    await crearCliente(tenantB);

    const result = await listConversations(tenantB, new Types.ObjectId().toString(), {
      page: 1,
      limit: 20,
      filtro: 'todos',
      asignadoA: adminA._id.toString(),
    });
    expect(result.data).toHaveLength(0);
  });
});
