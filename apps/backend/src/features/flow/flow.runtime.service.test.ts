import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';

const { sendOutboundMock, chatMock, extractMock } = vi.hoisted(() => ({
  sendOutboundMock: vi.fn().mockResolvedValue({}),
  chatMock: vi.fn(),
  extractMock: vi.fn(),
}));

vi.mock('../message/message.service.js', () => ({ sendOutbound: sendOutboundMock }));
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: chatMock, extract: extractMock }),
}));

import { Flow, FlowState } from './flow.model.js';
import { ejecutarFlujo } from './flow.runtime.service.js';
import type { IArista, INodo } from './flow.types.js';

const tenantId = new Types.ObjectId();

async function crearCliente(iaHabilitada = true): Promise<string> {
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_rt_${Math.random()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
    iaHabilitada,
  });
  return String(doc._id);
}

async function crearFlowActivo(nodos: INodo[], aristas: IArista[], entrada: string): Promise<Types.ObjectId> {
  const doc = await createScoped(Flow, tenantId, {
    nombre: 'RT',
    nodos,
    aristas,
    entrada,
    version: 1,
    estado: 'publicado',
    activo: true,
  });
  return doc._id as Types.ObjectId;
}

const nodoKb: INodo = {
  id: 'kb1',
  posicion: { x: 0, y: 0 },
  tipo: 'kb',
  config: { tipo: 'kb', pregunta: 'ultimo_mensaje', siNoHayRespuesta: 'No sé.' },
};

const nodoHandoff: INodo = {
  id: 'h1',
  posicion: { x: 0, y: 0 },
  tipo: 'handoff',
  config: { tipo: 'handoff' },
};

beforeEach(async () => {
  await Flow.deleteMany({});
  await FlowState.deleteMany({});
  await Cliente.deleteMany({});
  await Flow.syncIndexes();
  await FlowState.syncIndexes();
  sendOutboundMock.mockClear();
  chatMock.mockReset();
  extractMock.mockReset();
});

describe('ejecutarFlujo — guardas', () => {
  it('con iaHabilitada:false el flujo no se ejecuta', async () => {
    await crearFlowActivo([nodoHandoff], [], 'h1');
    const clienteId = await crearCliente(false);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola');

    expect(sendOutboundMock).not.toHaveBeenCalled();
    expect(await FlowState.countDocuments({})).toBe(0);
  });

  it('sin flujo activo en el tenant no se ejecuta nada', async () => {
    const clienteId = await crearCliente();
    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola');
    expect(sendOutboundMock).not.toHaveBeenCalled();
  });
});

describe('ejecutarFlujo — nodo handoff', () => {
  it('deja iaHabilitada:false tras el efecto de handoff', async () => {
    await crearFlowActivo([nodoHandoff], [], 'h1');
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'necesito un humano');

    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.iaHabilitada).toBe(false);
  });
});

describe('ejecutarFlujo — nodo kb', () => {
  it('llama a AIService.chat exactamente una vez y no consulta la KB por su cuenta', async () => {
    chatMock.mockResolvedValue({ data: 'La respuesta de la KB' });
    await crearFlowActivo([nodoKb], [], 'kb1');
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, '¿Tienen envíos a Cali?');

    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(sendOutboundMock).toHaveBeenCalledTimes(1);
    expect(sendOutboundMock.mock.calls[0]?.[2]).toMatchObject({ texto: 'La respuesta de la KB' });
  });

  it('todo envío pasa por sendOutbound, nunca por el cliente de Meta directo', async () => {
    chatMock.mockResolvedValue({ data: 'x' });
    await crearFlowActivo([nodoKb], [], 'kb1');
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola');

    expect(sendOutboundMock).toHaveBeenCalledWith(
      tenantId.toString(),
      clienteId,
      expect.objectContaining({ modo: 'auto' }),
      'bot',
    );
  });
});

describe('ejecutarFlujo — idempotencia', () => {
  it('reprocesar el mismo metaMessageId no vuelve a avanzar el flujo', async () => {
    chatMock.mockResolvedValue({ data: 'respuesta' });
    await crearFlowActivo([nodoKb], [], 'kb1');
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola', 'wamid.repetido');
    expect(sendOutboundMock).toHaveBeenCalledTimes(1);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola', 'wamid.repetido');
    expect(sendOutboundMock).toHaveBeenCalledTimes(1);
  });
});

describe('ejecutarFlujo — un efecto que falla no propaga al llamador', () => {
  it('sendOutbound rechazado se registra y no lanza', async () => {
    chatMock.mockResolvedValue({ data: 'respuesta' });
    sendOutboundMock.mockRejectedValueOnce(new Error('Meta caído'));
    await crearFlowActivo([nodoKb], [], 'kb1');
    const clienteId = await crearCliente(true);

    await expect(ejecutarFlujo(tenantId.toString(), clienteId, 'hola')).resolves.toBeUndefined();
  });
});
