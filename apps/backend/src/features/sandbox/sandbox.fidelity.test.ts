/**
 * HU-IA-08, criterios 3, 5, 11 y 15: la conversación de prueba corre el MISMO flujo que un cliente
 * real, con los mismos efectos; solo cambia el canal de salida y el destino del tiempo real.
 *
 * Aquí `sendOutbound`, `ejecutarFlujo` y la persistencia son los de verdad; solo se mockean Meta, Redis
 * y el LLM.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

const { sendTextMock, publishMock, queueAddMock } = vi.hoisted(() => ({
  sendTextMock: vi.fn(),
  publishMock: vi.fn().mockResolvedValue(undefined),
  queueAddMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: sendTextMock, sendTemplate: vi.fn(), sendMedia: vi.fn() },
}));
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: publishMock,
  subscribeRealtime: vi.fn(),
}));
vi.mock('../../config/queues.js', () => ({
  FLOW_RESUME_JOB: 'resume',
  FLOW_REMINDER_JOB: 'reminder',
  flowRuntimeQueue: { add: queueAddMock },
}));
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: vi.fn(), extract: vi.fn() }),
}));
vi.mock('../kb/kb.retrieval.service.js', () => ({ searchKnowledge: vi.fn().mockResolvedValue([]) }));

import { createScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { Lead } from '../lead/lead.model.js';
import { UserModel } from '../users/user.model.js';
import { Flow, FlowState } from '../flow/flow.model.js';
import { ejecutarFlujo } from '../flow/flow.runtime.service.js';
import type { IArista, INodo } from '../flow/flow.types.js';

const tenantId = new Types.ObjectId();

const mensaje = (id: string, texto: string): INodo => ({
  id,
  posicion: { x: 0, y: 0 },
  tipo: 'mensaje',
  config: { tipo: 'mensaje', texto },
});
const accion = (id: string, efecto: Record<string, unknown>): INodo => ({
  id,
  posicion: { x: 0, y: 0 },
  tipo: 'accion',
  config: { tipo: 'accion', efecto },
} as INodo);

async function crearFlujo(
  nodos: INodo[],
  aristas: IArista[],
  entrada: string,
  activo: boolean,
): Promise<Types.ObjectId> {
  const f = await Flow.create({ tenantId, nombre: activo ? 'Activo' : 'Borrador', activo, entrada, nodos, aristas });
  return f._id as Types.ObjectId;
}

async function crearCliente(extra: Record<string, unknown> = {}): Promise<string> {
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `x_${new Types.ObjectId()}`,
    telefono: `5730${Math.floor(Math.random() * 1e8)}`,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    ventana24hExpiraEn: new Date(Date.now() + 3_600_000),
    customFields: {},
    tagIds: [],
    iaHabilitada: true,
    ...extra,
  });
  return String(doc._id);
}

describe('fidelidad: la prueba corre lo mismo que un cliente real (criterio 3)', () => {
  beforeEach(async () => {
    sendTextMock.mockReset().mockImplementation(async () => ({ messageId: `wamid.${Math.random()}` }));
    publishMock.mockClear();
    queueAddMock.mockClear();
    await createScoped(MetaIntegration, tenantId, {
      canal: 'whatsapp',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessTokenEnc: encrypt('token'),
      activo: true,
    });
  });

  it('el mismo flujo produce la misma secuencia de mensajes salientes', async () => {
    await crearFlujo(
      [mensaje('a', 'Hola, soy Sofi'), mensaje('b', '¿En qué te ayudo?')],
      [{ id: 'e1', from: 'a', to: 'b' }],
      'a',
      true,
    );
    const real = await crearCliente();
    const prueba = await crearCliente({ esPrueba: true, pruebaOwnerId: new Types.ObjectId() });

    await ejecutarFlujo(tenantId.toString(), real, 'hola', 'wamid.in-real');
    const enviadosPorMeta = sendTextMock.mock.calls.map((c) => c[1] as string);
    sendTextMock.mockClear();

    await ejecutarFlujo(tenantId.toString(), prueba, 'hola', 'prueba-in-1');

    const guardadosPrueba = (
      await Message.find({ clienteId: prueba, direccion: 'outbound' }).sort({ createdAt: 1, _id: 1 }).lean()
    ).map((m) => m.texto);

    expect(enviadosPorMeta).toEqual(['Hola, soy Sofi', '¿En qué te ayudo?']);
    expect(guardadosPrueba).toEqual(enviadosPorMeta);
    // La prueba no tocó a Meta.
    expect(sendTextMock).not.toHaveBeenCalled();
  });

  it('el cliente de prueba corre el flujo ELEGIDO aunque esté inactivo; el real sigue con el activo', async () => {
    await crearFlujo([mensaje('a', 'Texto del flujo activo')], [], 'a', true);
    const borrador = await crearFlujo([mensaje('a', 'Texto del borrador')], [], 'a', false);
    const real = await crearCliente();
    const prueba = await crearCliente({
      esPrueba: true,
      pruebaOwnerId: new Types.ObjectId(),
      pruebaFlowId: borrador,
    });

    await ejecutarFlujo(tenantId.toString(), real, 'hola', 'w1');
    await ejecutarFlujo(tenantId.toString(), prueba, 'hola', 'p1');

    expect(sendTextMock.mock.calls.map((c) => c[1])).toEqual(['Texto del flujo activo']);
    const textoPrueba = (await Message.findOne({ clienteId: prueba, direccion: 'outbound' }).lean())?.texto;
    expect(textoPrueba).toBe('Texto del borrador');
  });

  it('si el flujo elegido se borró, la prueba cae al activo en vez de quedarse muda', async () => {
    await crearFlujo([mensaje('a', 'Texto del flujo activo')], [], 'a', true);
    const prueba = await crearCliente({
      esPrueba: true,
      pruebaOwnerId: new Types.ObjectId(),
      pruebaFlowId: new Types.ObjectId(), // ya no existe
    });

    await ejecutarFlujo(tenantId.toString(), prueba, 'hola', 'p1');

    expect((await Message.findOne({ clienteId: prueba, direccion: 'outbound' }).lean())?.texto).toBe(
      'Texto del flujo activo',
    );
  });

  it('un nodo espera de la prueba guarda cuándo vence, para ofrecer «Avanzar ahora»', async () => {
    await crearFlujo(
      [
        { id: 'esp', posicion: { x: 0, y: 0 }, tipo: 'espera', config: { tipo: 'espera', minutos: 30 } },
        mensaje('fin', 'Ya volviste'),
      ],
      [{ id: 'e1', from: 'esp', to: 'fin' }],
      'esp',
      true,
    );
    const owner = new Types.ObjectId();
    const prueba = await crearCliente({ esPrueba: true, pruebaOwnerId: owner });

    await ejecutarFlujo(tenantId.toString(), prueba, 'hola', 'p1');

    const estado = await FlowState.findOne({ clienteId: prueba }).lean();
    expect(estado?.esperaToken).toBeTruthy();
    expect(estado?.esperaHasta).toBeInstanceOf(Date);
    const efectos = publishMock.mock.calls
      .map((c) => c[0] as { type: string; ownerId?: string; efecto?: { tipo: string } })
      .filter((e) => e.type === 'sandbox:effect');
    expect(efectos.map((e) => e.efecto?.tipo)).toContain('espera');
    expect(efectos.every((e) => e.ownerId === String(owner))).toBe(true);
  });
});

describe('efectos del flujo sobre la conversación de prueba', () => {
  beforeEach(() => {
    sendTextMock.mockReset();
    publishMock.mockClear();
  });

  it('crear_lead crea un lead marcado como prueba y avisa al chat (criterio 8/9)', async () => {
    const owner = await UserModel.create({
      tenantId, nombre: 'Dueña', email: `o-${new Types.ObjectId()}@t.com`, passwordHash: 'h', rol: 'admin', activo: true,
    });
    await crearFlujo(
      [accion('acc', { tipo: 'crear_lead' }), mensaje('fin', 'Listo')],
      [{ id: 'e1', from: 'acc', to: 'fin' }],
      'acc',
      true,
    );
    const prueba = await crearCliente({ esPrueba: true, pruebaOwnerId: owner._id });

    await ejecutarFlujo(tenantId.toString(), prueba, 'hola', 'p1');

    const lead = await Lead.findOne({ clienteId: prueba }).lean();
    expect(lead?.esPrueba).toBe(true);
    expect(String(lead?.responsableId)).toBe(String(owner._id));
    const tipos = publishMock.mock.calls.map((c) => (c[0] as { efecto?: { tipo: string } }).efecto?.tipo);
    expect(tipos).toContain('lead_creado');
  });
});

describe('los mensajes del flujo de un cliente REAL llegan en vivo (criterio 15)', () => {
  beforeEach(() => {
    sendTextMock.mockReset().mockResolvedValue({ messageId: 'wamid.x' });
    publishMock.mockClear();
  });

  it('enviar_mensaje emite message:new al room del tenant', async () => {
    await createScoped(MetaIntegration, tenantId, {
      canal: 'whatsapp',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessTokenEnc: encrypt('token'),
      activo: true,
    });
    await crearFlujo([mensaje('a', 'Hola')], [], 'a', true);
    const real = await crearCliente();

    await ejecutarFlujo(tenantId.toString(), real, 'hola', 'w1');

    const tipos = publishMock.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(tipos).toContain('message:new');
    expect(tipos).not.toContain('sandbox:message');
  });
});
