import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

const { mockPublish } = vi.hoisted(() => ({ mockPublish: vi.fn() }));
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: mockPublish,
  subscribeRealtime: vi.fn(),
}));
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: vi.fn(), classify: vi.fn(), summarize: vi.fn() }),
}));

import { handoffConversation, setIaHabilitada } from './conversation.service.js';
import { Cliente } from '../cliente/cliente.model.js';
import { User } from '../users/user.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { createScoped } from '../../repositories/base.repository.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

async function crearAdmin(tenantId: Types.ObjectId, nombre: string): Promise<string> {
  const u = await User.create({
    tenantId,
    nombre,
    email: `${nombre}-${new Types.ObjectId().toString()}@x.com`,
    passwordHash: 'x',
    rol: 'admin',
    activo: true,
  });
  return (u._id as Types.ObjectId).toString();
}

async function crearCliente(
  tenantId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `wa-${new Types.ObjectId().toString()}`,
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    noLeidos: 0,
    iaHabilitada: true,
    ...overrides,
  });
  return (doc._id as Types.ObjectId).toString();
}

beforeEach(async () => {
  mockPublish.mockReset();
  await Promise.all([Cliente.deleteMany({}), User.deleteMany({}), AuditEvent.deleteMany({})]);
});

describe('HU-IA-03 — handoffConversation', () => {
  it('apaga la IA, marca el handoff, sube no leídos y asigna al destino', async () => {
    const asesor = await crearAdmin(tenantA, 'Ana');
    const clienteId = await crearCliente(tenantA);

    await handoffConversation(tenantA.toString(), clienteId, 'explicit_request', asesor);

    const c = await Cliente.findById(clienteId).lean();
    expect(c?.iaHabilitada).toBe(false);
    expect(c?.handoffMotivo).toBe('explicit_request');
    expect(c?.handoffAt).toBeInstanceOf(Date);
    expect(c?.noLeidos).toBe(1);
    expect(String(c?.asesorId)).toBe(asesor);
  });

  it('notifica al destinatario con Sofi como actor', async () => {
    const asesor = await crearAdmin(tenantA, 'Ana');
    const clienteId = await crearCliente(tenantA);

    await handoffConversation(tenantA.toString(), clienteId, 'keyword', asesor);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const evt = mockPublish.mock.calls[0]?.[0];
    expect(evt.type).toBe('conversation:assigned');
    expect(evt.targetUserId).toBe(asesor);
    // Actor nulo = el sistema. El asesor tiene que poder distinguir "me la pasó el bot" de
    // "me la pasó un compañero".
    expect(evt.actor).toEqual({ id: null, nombre: 'Sofi' });
    expect(evt.conversation.handoff).toEqual({
      at: expect.any(String),
      motivo: 'keyword',
      // `null` porque lo disparo una regla de fabrica, no una condicion del admin (HU-IA-07).
      condicion: null,
    });
  });

  it('NO le quita la conversación a quien ya la lleva', async () => {
    const dueño = await crearAdmin(tenantA, 'Dueno');
    const otro = await crearAdmin(tenantA, 'Otro');
    const clienteId = await crearCliente(tenantA, { asesorId: new Types.ObjectId(dueño) });

    await handoffConversation(tenantA.toString(), clienteId, 'low_confidence', otro);

    const c = await Cliente.findById(clienteId).lean();
    expect(String(c?.asesorId)).toBe(dueño);
    expect(c?.iaHabilitada).toBe(false);
    // Nadie estrena responsabilidad, así que el evento es de actualización, no de asignación.
    expect(mockPublish.mock.calls[0]?.[0].type).toBe('conversation:updated');
  });

  it('sin destino configurado cae al primer admin activo del tenant', async () => {
    const admin = await crearAdmin(tenantA, 'Unico');
    const clienteId = await crearCliente(tenantA);

    await handoffConversation(tenantA.toString(), clienteId, 'keyword', null);

    expect(String((await Cliente.findById(clienteId).lean())?.asesorId)).toBe(admin);
  });

  it('con un destino configurado que ya no es asignable, cae al primer admin activo', async () => {
    const admin = await crearAdmin(tenantA, 'Vigente');
    const fantasma = new Types.ObjectId().toString();
    const clienteId = await crearCliente(tenantA);

    await handoffConversation(tenantA.toString(), clienteId, 'keyword', fantasma);

    expect(String((await Cliente.findById(clienteId).lean())?.asesorId)).toBe(admin);
  });

  it('sin admins activos transfiere igual, sin asignar', async () => {
    const clienteId = await crearCliente(tenantA);

    await handoffConversation(tenantA.toString(), clienteId, 'intent_purchase', null);

    const c = await Cliente.findById(clienteId).lean();
    // La conversación no se pierde: sube a la bandeja sin dueño en vez de quedarse con el bot.
    expect(c?.iaHabilitada).toBe(false);
    expect(c?.noLeidos).toBe(1);
    expect(c?.asesorId ?? null).toBeNull();
    expect(mockPublish.mock.calls[0]?.[0].type).toBe('conversation:updated');
  });

  it('registra un evento de auditoría con actor nulo', async () => {
    const asesor = await crearAdmin(tenantA, 'Ana');
    const clienteId = await crearCliente(tenantA);

    await handoffConversation(tenantA.toString(), clienteId, 'intent_purchase', asesor);

    const eventos = await AuditEvent.find({ entidadId: clienteId }).lean();
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.accion).toBe('conversation.handoff');
    expect(eventos[0]?.actorId ?? null).toBeNull();
    expect(eventos[0]?.despues).toMatchObject({ iaHabilitada: false, motivo: 'intent_purchase' });
  });

  it('es idempotente: un segundo handoff no escribe, no audita y no publica', async () => {
    const asesor = await crearAdmin(tenantA, 'Ana');
    const clienteId = await crearCliente(tenantA);

    await handoffConversation(tenantA.toString(), clienteId, 'keyword', asesor);
    const primero = await Cliente.findById(clienteId).lean();
    mockPublish.mockReset();

    await handoffConversation(tenantA.toString(), clienteId, 'low_confidence', asesor);

    const segundo = await Cliente.findById(clienteId).lean();
    expect(segundo?.noLeidos).toBe(primero?.noLeidos);
    expect(segundo?.handoffMotivo).toBe('keyword');
    expect(segundo?.handoffAt).toEqual(primero?.handoffAt);
    expect(await AuditEvent.countDocuments({ entidadId: clienteId })).toBe(1);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('con Sofi ya apagada a mano por un asesor, no hace nada', async () => {
    const clienteId = await crearCliente(tenantA, { iaHabilitada: false });

    await handoffConversation(tenantA.toString(), clienteId, 'keyword', null);

    expect((await Cliente.findById(clienteId).lean())?.handoffAt ?? null).toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('una conversación inexistente no lanza', async () => {
    await expect(
      handoffConversation(tenantA.toString(), new Types.ObjectId().toString(), 'keyword', null),
    ).resolves.toBeUndefined();
  });

  it('AISLAMIENTO: no alcanza a un cliente de otro tenant', async () => {
    const clienteDeB = await crearCliente(tenantB);

    await handoffConversation(tenantA.toString(), clienteDeB, 'keyword', null);

    const c = await Cliente.findById(clienteDeB).lean();
    expect(c?.iaHabilitada).toBe(true);
    expect(c?.handoffAt ?? null).toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
  });
});

describe('HU-IA-03 — reactivar a Sofi cierra el handoff', () => {
  it('setIaHabilitada(true) limpia handoffAt y handoffMotivo', async () => {
    const clienteId = await crearCliente(tenantA);
    await handoffConversation(tenantA.toString(), clienteId, 'keyword', null);

    const conversation = await setIaHabilitada(tenantA.toString(), clienteId, true);

    const c = await Cliente.findById(clienteId).lean();
    expect(c?.iaHabilitada).toBe(true);
    expect(c?.handoffAt ?? null).toBeNull();
    expect(c?.handoffMotivo ?? null).toBeNull();
    // Y el DTO tampoco puede seguir diciendo que está transferida.
    expect(conversation.handoff).toBeNull();
  });

  it('apagar a Sofi a mano NO marca handoff', async () => {
    const clienteId = await crearCliente(tenantA);

    const conversation = await setIaHabilitada(tenantA.toString(), clienteId, false);

    expect(conversation.iaHabilitada).toBe(false);
    // Es una decisión del asesor, no una transferencia automática.
    expect(conversation.handoff).toBeNull();
  });
});
