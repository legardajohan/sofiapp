import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';

const { sendOutboundMock, extractMock, searchKnowledgeMock } = vi.hoisted(() => ({
  sendOutboundMock: vi.fn().mockResolvedValue({}),
  extractMock: vi.fn(),
  searchKnowledgeMock: vi.fn().mockResolvedValue([]),
}));

vi.mock('../message/message.service.js', () => ({ sendOutbound: sendOutboundMock }));
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: vi.fn(), extract: extractMock }),
}));
vi.mock('../kb/kb.retrieval.service.js', () => ({ searchKnowledge: searchKnowledgeMock }));
vi.mock('../../config/queues.js', () => ({
  FLOW_RESUME_JOB: 'resume',
  FLOW_REMINDER_JOB: 'reminder',
  flowRuntimeQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import { Flow, FlowState } from './flow.model.js';
import { ejecutarFlujo } from './flow.runtime.service.js';
import type { IArista, INodo } from './flow.types.js';

const tenantId = new Types.ObjectId();

async function crearCliente(iaHabilitada = true): Promise<string> {
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_ia_${Math.random()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
    iaHabilitada,
  });
  return String(doc._id);
}

async function crearFlowActivo(nodos: INodo[], aristas: IArista[], entrada: string): Promise<void> {
  await createScoped(Flow, tenantId, {
    nombre: 'IA node test',
    nodos,
    aristas,
    entrada,
    version: 1,
    estado: 'publicado',
    activo: true,
  });
}

async function crearMensaje(clienteId: string, sender: 'user' | 'bot' | 'agent', texto: string): Promise<void> {
  await createScoped(Message, tenantId, {
    clienteId: new Types.ObjectId(clienteId),
    canal: 'whatsapp',
    direccion: sender === 'user' ? 'inbound' : 'outbound',
    sender,
    tipo: 'text',
    texto,
    status: 'sent',
  });
}

const nodoIa: INodo = {
  id: 'ia1',
  posicion: { x: 0, y: 0 },
  tipo: 'ia',
  config: {
    tipo: 'ia',
    objetivo: 'Averiguar si el cliente quiere comprar.',
    salidas: [{ etiqueta: 'quiere_comprar', descripcion: 'El cliente confirma intención de compra', nodoDestino: 'fin' }],
    ramaPorDefecto: 'default',
    maxTurnos: 3,
    usarKb: true,
  },
};

const nodoFin: INodo = { id: 'fin', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Genial, cerramos la venta' } };
const nodoDefault: INodo = { id: 'default', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Se acabó el tiempo' } };

beforeEach(async () => {
  await Flow.deleteMany({});
  await FlowState.deleteMany({});
  await Cliente.deleteMany({});
  await Message.deleteMany({});
  await Flow.syncIndexes();
  await FlowState.syncIndexes();
  sendOutboundMock.mockClear();
  extractMock.mockReset();
  searchKnowledgeMock.mockReset();
  searchKnowledgeMock.mockResolvedValue([]);
});

describe('nodo ia — de punta a punta (HU-FLOW-03)', () => {
  it('conversa varios turnos (salida: null dos veces) y termina en el nodo destino', async () => {
    extractMock
      .mockResolvedValueOnce({ data: { respuesta: '¿Qué buscas exactamente?', salida: null } })
      .mockResolvedValueOnce({ data: { respuesta: '¿Y tu presupuesto?', salida: null } })
      .mockResolvedValueOnce({ data: { respuesta: 'Perfecto, cerremos', salida: 'quiere_comprar' } });

    await crearFlowActivo([nodoIa, nodoFin, nodoDefault], [], 'ia1');
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola quiero info');
    expect(sendOutboundMock).toHaveBeenCalledTimes(1);
    expect(sendOutboundMock.mock.calls[0]?.[2]).toMatchObject({ texto: '¿Qué buscas exactamente?' });

    await ejecutarFlujo(tenantId.toString(), clienteId, 'busco un producto');
    expect(sendOutboundMock).toHaveBeenCalledTimes(2);
    expect(sendOutboundMock.mock.calls[1]?.[2]).toMatchObject({ texto: '¿Y tu presupuesto?' });

    await ejecutarFlujo(tenantId.toString(), clienteId, 'tengo bastante presupuesto');
    // Al salir por la rama, el nodo `ia` no envía la respuesta de ese turno: habla el nodo destino.
    expect(sendOutboundMock).toHaveBeenCalledTimes(3);
    expect(sendOutboundMock.mock.calls[2]?.[2]).toMatchObject({ texto: 'Genial, cerramos la venta' });
  });

  it('el historial que recibe el mock trae los mensajes previos en orden cronológico (criterio 3)', async () => {
    extractMock.mockResolvedValue({ data: { respuesta: 'ok', salida: 'quiere_comprar' } });
    await crearFlowActivo([nodoIa, nodoFin, nodoDefault], [], 'ia1');
    const clienteId = await crearCliente(true);

    await crearMensaje(clienteId, 'user', 'Hola, buenas');
    await crearMensaje(clienteId, 'bot', '¡Hola! ¿En qué te ayudo?');
    await crearMensaje(clienteId, 'user', 'Quiero comprar');

    await ejecutarFlujo(tenantId.toString(), clienteId, 'Quiero comprar');

    const [{ historial }] = extractMock.mock.calls[0] as [{ historial: { role: string; content: string }[] }];
    const contenidos = historial.map((h) => h.content);
    expect(contenidos.indexOf('Hola, buenas')).toBeLessThan(contenidos.indexOf('¡Hola! ¿En qué te ayudo?'));
    expect(contenidos.indexOf('¡Hola! ¿En qué te ayudo?')).toBeLessThan(contenidos.indexOf('Quiero comprar'));
  });

  it('con usarKb: false no llama a searchKnowledge; con true, sí, y sus fragmentos llegan al historial', async () => {
    extractMock.mockResolvedValue({ data: { respuesta: 'ok', salida: 'quiere_comprar' } });

    const nodoIaSinKb: INodo = { ...nodoIa, config: { ...nodoIa.config, usarKb: false } as typeof nodoIa.config };
    await crearFlowActivo([nodoIaSinKb, nodoFin, nodoDefault], [], 'ia1');
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola');
    expect(searchKnowledgeMock).not.toHaveBeenCalled();

    await FlowState.deleteMany({});
    extractMock.mockClear();
    searchKnowledgeMock.mockResolvedValue([{ texto: 'Horario: 9am-6pm', documentId: 'doc1' }]);
    await Flow.deleteMany({});
    await crearFlowActivo([nodoIa, nodoFin, nodoDefault], [], 'ia1');

    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola de nuevo');
    expect(searchKnowledgeMock).toHaveBeenCalledWith(tenantId.toString(), 'hola de nuevo');
    const [{ historial }] = extractMock.mock.calls[0] as [{ historial: { role: string; content: string }[] }];
    expect(historial.some((h) => h.content.includes('Horario: 9am-6pm'))).toBe(true);
  });

  it('iaHabilitada: false → el nodo no responde ni llama a la IA (criterio 6)', async () => {
    await crearFlowActivo([nodoIa, nodoFin, nodoDefault], [], 'ia1');
    const clienteId = await crearCliente(false);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola');

    expect(extractMock).not.toHaveBeenCalled();
    expect(sendOutboundMock).not.toHaveBeenCalled();
  });

  it('cuota agotada: sendOutbound lanza, se registra y el flujo no se cae (criterio 7)', async () => {
    extractMock.mockResolvedValue({ data: { respuesta: 'Hola, ¿en qué te ayudo?', salida: null } });
    sendOutboundMock.mockRejectedValueOnce(new Error('Cuota mensajesMes agotada'));

    await crearFlowActivo([nodoIa, nodoFin, nodoDefault], [], 'ia1');
    const clienteId = await crearCliente(true);

    await expect(ejecutarFlujo(tenantId.toString(), clienteId, 'hola')).resolves.toBeUndefined();

    const state = await FlowState.findOne({ clienteId }).lean();
    expect(state?.nodoActualId).toBe('ia1');
  });
});
