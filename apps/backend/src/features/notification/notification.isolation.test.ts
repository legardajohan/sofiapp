import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../cliente/cliente.model.js';
import { UserModel } from '../users/user.model.js';
import { Notification } from './notification.model.js';

vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const { assignConversation } = await import('../conversation/conversation.service.js');
const { countUnread, listNotifications, markAsRead } = await import('./notification.service.js');

// Test de aislamiento multi-tenant obligatorio (docs/multi-tenancy.md §8) — HU-NOTIF-01.
describe('notification — aislamiento multi-tenant', () => {
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

  it('las notificaciones de tenantA son invisibles al listar/contar con tenantB', async () => {
    const actorA = await crearAdmin(tenantA, 'Actor');
    const destinoA = await crearAdmin(tenantA, 'Destino');
    const clienteA = await crearCliente(tenantA);
    await assignConversation(tenantA, actorA._id.toString(), clienteA._id.toString(), destinoA._id.toString());

    const listado = await listNotifications(tenantB, destinoA._id.toString(), { page: 1, limit: 20 });
    expect(listado.data).toHaveLength(0);
    expect(listado.total).toBe(0);
    expect(await countUnread(tenantB, destinoA._id.toString())).toBe(0);
  });

  it('markAsRead con tenantB sobre una notificación de tenantA → 404, sin modificar nada', async () => {
    const actorA = await crearAdmin(tenantA, 'Actor');
    const destinoA = await crearAdmin(tenantA, 'Destino');
    const clienteA = await crearCliente(tenantA);
    await assignConversation(tenantA, actorA._id.toString(), clienteA._id.toString(), destinoA._id.toString());
    const noti = await Notification.findOne({ userId: destinoA._id }).lean();

    await expect(markAsRead(tenantB, destinoA._id.toString(), String(noti?._id))).rejects.toMatchObject({
      statusCode: 404,
    });

    const sinTocar = await Notification.findById(noti?._id).lean();
    expect(sinTocar?.leidaAt ?? null).toBeNull();
  });

  it('toda lectura/escritura pasa por *Scoped: el filtro incluye tenantId', async () => {
    const actorA = await crearAdmin(tenantA, 'Actor');
    const destinoA = await crearAdmin(tenantA, 'Destino');
    const clienteA = await crearCliente(tenantA);
    await assignConversation(tenantA, actorA._id.toString(), clienteA._id.toString(), destinoA._id.toString());

    // El propio tenant sí la ve — control positivo de que el aislamiento no es un falso 0 global.
    expect(await countUnread(tenantA, destinoA._id.toString())).toBe(1);
  });
});
