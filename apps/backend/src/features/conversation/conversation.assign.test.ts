import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../cliente/cliente.model.js';
import { UserModel } from '../users/user.model.js';
import { AuditEvent } from '../audit/audit.model.js';

// El puente de tiempo real no debe abrir Redis en tests (patrón de tests/unit/conversation.service.test.ts).
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const { assignConversation, listAssignments } = await import('./conversation.service.js');

const tenantId = new Types.ObjectId().toString();
const actorId = new Types.ObjectId().toString();

async function crearAdmin(
  overrides: Partial<{ nombre: string; activo: boolean; subrol: string; rol: string }> = {},
) {
  return UserModel.create({
    tenantId: new Types.ObjectId(tenantId),
    nombre: overrides.nombre ?? 'Admin',
    email: `admin-${new Types.ObjectId().toString()}@t.com`,
    passwordHash: 'hash',
    rol: overrides.rol ?? 'admin',
    activo: overrides.activo ?? true,
    ...(overrides.subrol ? { subrol: overrides.subrol } : {}),
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

describe('conversation.service — assignConversation (HU-OMNI-02)', () => {
  it('asigna a otro admin y persiste asesorId + DTO asignadoA*', async () => {
    const admin = await crearAdmin({ nombre: 'Coord', subrol: 'coordinator' });
    const cliente = await crearCliente();

    const result = await assignConversation(
      tenantId,
      actorId,
      cliente._id.toString(),
      admin._id.toString(),
    );

    expect(result.asesorId).toBe(admin._id.toString());
    expect(result.asignadoA).toBe(admin._id.toString());
    expect(result.asignadoANombre).toBe('Coord');
    expect(result.asignadoASubrol).toBe('coordinator');

    const persisted = await Cliente.findById(cliente._id).lean();
    expect(String(persisted?.asesorId)).toBe(admin._id.toString());
  });

  it('reasigna una conversación ya asignada, sin restricción de propiedad', async () => {
    const adminA = await crearAdmin({ nombre: 'A' });
    const adminB = await crearAdmin({ nombre: 'B' });
    const cliente = await crearCliente();
    await assignConversation(tenantId, actorId, cliente._id.toString(), adminA._id.toString());

    // El actor no es ni A ni B: no hay comprobación de propiedad.
    const result = await assignConversation(
      tenantId,
      actorId,
      cliente._id.toString(),
      adminB._id.toString(),
    );
    expect(result.asignadoA).toBe(adminB._id.toString());
  });

  it('un admin puede auto-asignarse una conversación', async () => {
    const admin = await crearAdmin({ nombre: 'Self' });
    const cliente = await crearCliente();
    const result = await assignConversation(
      tenantId,
      admin._id.toString(),
      cliente._id.toString(),
      admin._id.toString(),
    );
    expect(result.asignadoA).toBe(admin._id.toString());
  });

  it('desasigna con asignadoA: null y audita despues.asignadoA = null', async () => {
    const admin = await crearAdmin();
    const cliente = await crearCliente();
    await assignConversation(tenantId, actorId, cliente._id.toString(), admin._id.toString());

    const result = await assignConversation(tenantId, actorId, cliente._id.toString(), null);
    expect(result.asignadoA).toBeNull();

    const events = await AuditEvent.find({ entidadId: cliente._id }).sort({ createdAt: 1 }).lean();
    expect(events).toHaveLength(2);
    expect(events[1]?.despues).toMatchObject({ asignadoA: null });
    expect(events[1]?.antes).toMatchObject({ asignadoA: admin._id.toString() });
  });

  it('es idempotente: asignar el mismo valor no crea auditoría nueva', async () => {
    const admin = await crearAdmin();
    const cliente = await crearCliente();
    await assignConversation(tenantId, actorId, cliente._id.toString(), admin._id.toString());
    await assignConversation(tenantId, actorId, cliente._id.toString(), admin._id.toString());

    const events = await AuditEvent.find({ entidadId: cliente._id }).lean();
    expect(events).toHaveLength(1);
  });

  it('conversación inexistente → 404', async () => {
    const admin = await crearAdmin();
    await expect(
      assignConversation(tenantId, actorId, new Types.ObjectId().toString(), admin._id.toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('destinatario inexistente → 404 y sin cambios', async () => {
    const cliente = await crearCliente();
    await expect(
      assignConversation(
        tenantId,
        actorId,
        cliente._id.toString(),
        new Types.ObjectId().toString(),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    const persisted = await Cliente.findById(cliente._id).lean();
    expect(persisted?.asesorId ?? null).toBeNull();
  });

  it('destinatario inactivo → 404', async () => {
    const admin = await crearAdmin({ activo: false });
    const cliente = await crearCliente();
    await expect(
      assignConversation(tenantId, actorId, cliente._id.toString(), admin._id.toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('destinatario que no es admin (superadmin) → 404', async () => {
    const superadmin = await UserModel.create({
      tenantId: null,
      nombre: 'Root',
      email: `root-${new Types.ObjectId().toString()}@t.com`,
      passwordHash: 'hash',
      rol: 'superadmin',
      activo: true,
    });
    const cliente = await crearCliente();
    await expect(
      assignConversation(tenantId, actorId, cliente._id.toString(), superadmin._id.toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('cada cambio efectivo escribe un audit_events con antes/despues correctos', async () => {
    const admin = await crearAdmin();
    const cliente = await crearCliente();
    await assignConversation(tenantId, actorId, cliente._id.toString(), admin._id.toString());

    const events = await AuditEvent.find({ entidadId: cliente._id }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      accion: 'conversation.assign',
      entidad: 'cliente',
      antes: { asignadoA: null },
      despues: { asignadoA: admin._id.toString() },
    });
    expect(String(events[0]?.actorId)).toBe(actorId);
  });
});

describe('conversation.service — listAssignments (HU-OMNI-02)', () => {
  it('devuelve el historial paginado, más reciente primero', async () => {
    const adminA = await crearAdmin({ nombre: 'A' });
    const adminB = await crearAdmin({ nombre: 'B' });
    const cliente = await crearCliente();
    await assignConversation(tenantId, actorId, cliente._id.toString(), adminA._id.toString());
    await assignConversation(tenantId, actorId, cliente._id.toString(), adminB._id.toString());

    const result = await listAssignments(tenantId, cliente._id.toString(), { page: 1, limit: 20 });
    expect(result.total).toBe(2);
    expect(result.data[0]?.a?.id).toBe(adminB._id.toString());
    expect(result.data[0]?.de?.id).toBe(adminA._id.toString());
    expect(result.data[1]?.a?.id).toBe(adminA._id.toString());
  });

  it('conversación inexistente → 404', async () => {
    await expect(
      listAssignments(tenantId, new Types.ObjectId().toString(), { page: 1, limit: 20 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
