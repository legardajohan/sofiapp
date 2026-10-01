import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../cliente/cliente.model.js';
import { UserModel } from '../users/user.model.js';

vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const { assignConversation } = await import('../conversation/conversation.service.js');
const { countUnread, listNotifications } = await import('./notification.service.js');

/**
 * Escenario del pedido original: "verificar que 2 usuarios admin, que se delega un chat:
 * Notificaciones". Dos admins del mismo tenant; Ana le delega la conversación a Beto.
 */
describe('HU-NOTIF-01 — dos admins delegan un chat', () => {
  it('Beto recibe la notificación de la reasignación; Ana no; un admin de otro tenant tampoco', async () => {
    const tenantId = new Types.ObjectId().toString();
    const otroTenantId = new Types.ObjectId().toString();

    const ana = await UserModel.create({
      tenantId: new Types.ObjectId(tenantId),
      nombre: 'Ana',
      email: `ana-${new Types.ObjectId().toString()}@t.com`,
      passwordHash: 'hash',
      rol: 'admin',
      activo: true,
    });
    const beto = await UserModel.create({
      tenantId: new Types.ObjectId(tenantId),
      nombre: 'Beto',
      email: `beto-${new Types.ObjectId().toString()}@t.com`,
      passwordHash: 'hash',
      rol: 'admin',
      activo: true,
    });
    const admOtroTenant = await UserModel.create({
      tenantId: new Types.ObjectId(otroTenantId),
      nombre: 'Externo',
      email: `externo-${new Types.ObjectId().toString()}@t.com`,
      passwordHash: 'hash',
      rol: 'admin',
      activo: true,
    });

    const cliente = await Cliente.create({
      tenantId: new Types.ObjectId(tenantId),
      metaUserId: `wa-${new Types.ObjectId().toString()}`,
      telefono: '3000000000',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tags: [],
      asesorId: ana._id,
    });

    // Ana (dueña de la conversación) se la delega a Beto.
    await assignConversation(tenantId, ana._id.toString(), cliente._id.toString(), beto._id.toString());

    // Beto: 1 notificación sin leer, de tipo assignment, con Ana como actor.
    expect(await countUnread(tenantId, beto._id.toString())).toBe(1);
    const bandejaBeto = await listNotifications(tenantId, beto._id.toString(), { page: 1, limit: 20 });
    expect(bandejaBeto.data).toHaveLength(1);
    expect(bandejaBeto.data[0]).toMatchObject({
      tipo: 'assignment',
      actorNombre: 'Ana',
      conversacionId: cliente._id.toString(),
    });

    // Ana: reasignar no genera notificación para quien la hace.
    expect(await countUnread(tenantId, ana._id.toString())).toBe(0);
    const bandejaAna = await listNotifications(tenantId, ana._id.toString(), { page: 1, limit: 20 });
    expect(bandejaAna.data).toHaveLength(0);

    // Un admin de OTRO tenant no ve ni cuenta nada, aunque comparta el mismo userId no sea el caso aquí.
    expect(await countUnread(otroTenantId, admOtroTenant._id.toString())).toBe(0);
  });
});
