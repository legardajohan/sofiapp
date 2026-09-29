import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../cliente/cliente.model.js';
import { UserModel } from '../users/user.model.js';
import { Notification } from './notification.model.js';

// El puente de tiempo real no debe abrir Redis en tests (mismo patrón que conversation.assign.test.ts).
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const { assignConversation, handoffConversation } = await import('../conversation/conversation.service.js');
const { countUnread, listNotifications, markAllAsRead, markAsRead } = await import('./notification.service.js');

const tenantId = new Types.ObjectId().toString();
const actorId = new Types.ObjectId().toString();

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

describe('notification.service — creación desde assignConversation (HU-OMNI-02)', () => {
  it('reasignación efectiva crea una Notification tipo assignment', async () => {
    const actor = await crearAdmin('Ana');
    const destino = await crearAdmin('Beto');
    const cliente = await crearCliente();

    await assignConversation(tenantId, actor._id.toString(), cliente._id.toString(), destino._id.toString());

    const notis = await Notification.find({ userId: destino._id }).lean();
    expect(notis).toHaveLength(1);
    expect(notis[0]).toMatchObject({
      tipo: 'assignment',
      actorNombre: 'Ana',
      mensaje: 'Ana te reasignó una conversación',
      leidaAt: null,
    });
    expect(String(notis[0]?.actorId)).toBe(actor._id.toString());
    expect(String(notis[0]?.conversacionId)).toBe(cliente._id.toString());
  });

  it('la reasignación idempotente NO crea notificación', async () => {
    const destino = await crearAdmin();
    const cliente = await crearCliente();
    await assignConversation(tenantId, actorId, cliente._id.toString(), destino._id.toString());

    await assignConversation(tenantId, actorId, cliente._id.toString(), destino._id.toString());

    expect(await Notification.countDocuments({ userId: destino._id })).toBe(1);
  });

  it('desasignar (asignadoA: null) NO crea notificación', async () => {
    const destino = await crearAdmin();
    const cliente = await crearCliente();
    await assignConversation(tenantId, actorId, cliente._id.toString(), destino._id.toString());

    await assignConversation(tenantId, actorId, cliente._id.toString(), null);

    expect(await Notification.countDocuments({ userId: destino._id })).toBe(1);
  });
});

describe('notification.service — creación desde handoffConversation (HU-IA-03)', () => {
  it('handoff con destino nuevo crea una Notification tipo handoff, actor Sofi', async () => {
    const asesor = await crearAdmin('Ana');
    const cliente = await crearCliente();

    await handoffConversation(tenantId, cliente._id.toString(), 'keyword', asesor._id.toString());

    const notis = await Notification.find({ userId: asesor._id }).lean();
    expect(notis).toHaveLength(1);
    expect(notis[0]).toMatchObject({
      tipo: 'handoff',
      actorId: null,
      actorNombre: 'Sofi',
      mensaje: 'Sofi te transfirió una conversación',
    });
  });

  it('handoff sobre conversación que ya tenía asesor NO crea notificación', async () => {
    const dueño = await crearAdmin('Dueno');
    const otro = await crearAdmin('Otro');
    const cliente = await crearCliente({ asesorId: dueño._id });

    await handoffConversation(tenantId, cliente._id.toString(), 'low_confidence', otro._id.toString());

    expect(await Notification.countDocuments({})).toBe(0);
  });

  it('handoff sin admin activo al que asignar NO crea notificación', async () => {
    const cliente = await crearCliente();

    await handoffConversation(tenantId, cliente._id.toString(), 'intent_purchase', null);

    expect(await Notification.countDocuments({})).toBe(0);
  });
});

describe('notification.service — listar, contar y marcar como leídas', () => {
  it('listNotifications y countUnread solo devuelven las del userId pedido, orden createdAt desc', async () => {
    const beto = await crearAdmin('Beto');
    const otro = await crearAdmin('Otro');
    const cliente1 = await crearCliente();
    const cliente2 = await crearCliente();

    await assignConversation(tenantId, actorId, cliente1._id.toString(), beto._id.toString());
    await assignConversation(tenantId, actorId, cliente2._id.toString(), beto._id.toString());
    await assignConversation(tenantId, actorId, cliente2._id.toString(), otro._id.toString());

    const result = await listNotifications(tenantId, beto._id.toString(), { page: 1, limit: 20 });
    expect(result.total).toBe(2);
    expect(result.data.every((n) => n.conversacionId === cliente1._id.toString() || n.conversacionId === cliente2._id.toString())).toBe(true);
    expect(new Date(result.data[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(result.data[1]!.createdAt).getTime());

    expect(await countUnread(tenantId, beto._id.toString())).toBe(2);
    expect(await countUnread(tenantId, otro._id.toString())).toBe(1);
  });

  it('markAsRead sobre una notificación de OTRO usuario del mismo tenant → 404, sin modificar nada', async () => {
    const beto = await crearAdmin('Beto');
    const cliente = await crearCliente();
    await assignConversation(tenantId, actorId, cliente._id.toString(), beto._id.toString());
    const noti = await Notification.findOne({ userId: beto._id }).lean();

    const otroUserId = new Types.ObjectId().toString();
    await expect(markAsRead(tenantId, otroUserId, String(noti?._id))).rejects.toMatchObject({ statusCode: 404 });

    const sinTocar = await Notification.findById(noti?._id).lean();
    expect(sinTocar?.leidaAt ?? null).toBeNull();
  });

  it('markAsRead es idempotente', async () => {
    const beto = await crearAdmin('Beto');
    const cliente = await crearCliente();
    await assignConversation(tenantId, actorId, cliente._id.toString(), beto._id.toString());
    const noti = await Notification.findOne({ userId: beto._id }).lean();

    const primera = await markAsRead(tenantId, beto._id.toString(), String(noti?._id));
    const segunda = await markAsRead(tenantId, beto._id.toString(), String(noti?._id));
    expect(primera.leidaAt).not.toBeNull();
    expect(segunda.leidaAt).not.toBeNull();
  });

  it('markAllAsRead marca todas las del usuario, sin afectar las de otro', async () => {
    const beto = await crearAdmin('Beto');
    const otro = await crearAdmin('Otro');
    const c1 = await crearCliente();
    const c2 = await crearCliente();
    const c3 = await crearCliente();
    await assignConversation(tenantId, actorId, c1._id.toString(), beto._id.toString());
    await assignConversation(tenantId, actorId, c2._id.toString(), beto._id.toString());
    await assignConversation(tenantId, actorId, c3._id.toString(), otro._id.toString());

    await markAllAsRead(tenantId, beto._id.toString());

    expect(await countUnread(tenantId, beto._id.toString())).toBe(0);
    expect(await countUnread(tenantId, otro._id.toString())).toBe(1);
  });
});
