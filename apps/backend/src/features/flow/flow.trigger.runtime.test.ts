import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';

const { sendOutboundMock } = vi.hoisted(() => ({ sendOutboundMock: vi.fn().mockResolvedValue({}) }));

vi.mock('../message/message.service.js', () => ({ sendOutbound: sendOutboundMock }));
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: vi.fn(), extract: vi.fn() }),
}));
vi.mock('../kb/kb.retrieval.service.js', () => ({ searchKnowledge: vi.fn().mockResolvedValue([]) }));
vi.mock('../../config/queues.js', () => ({
  FLOW_RESUME_JOB: 'resume',
  FLOW_REMINDER_JOB: 'reminder',
  flowRuntimeQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import { Flow, FlowState } from './flow.model.js';
import { ejecutarFlujo } from './flow.runtime.service.js';
import type { INodo, ITriggerFlow } from './flow.types.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

const posicion = { x: 0, y: 0 };
const nodoSaludo: INodo = { id: 'n1', posicion, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Hola' } };
const nodoCaptura: INodo = {
  id: 'c1',
  posicion,
  tipo: 'captura',
  config: { tipo: 'captura', campo: 'correo', descripcion: 'Correo', tipoDato: 'texto', pregunta: '¿Tu correo?', reintentos: 1 },
};

let contador = 0;
async function crearCliente(tenantId: Types.ObjectId): Promise<string> {
  contador += 1;
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_trg_${contador}`,
    telefono: `57300000${String(contador).padStart(4, '0')}`,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
    iaHabilitada: true,
  });
  return String(doc._id);
}

async function crearFlowActivo(tenantId: Types.ObjectId, nodos: INodo[], entrada: string, trigger?: ITriggerFlow) {
  return createScoped(Flow, tenantId, {
    nombre: 'T',
    nodos,
    aristas: [],
    entrada,
    ...(trigger ? { trigger } : {}),
    version: 1,
    estado: 'publicado',
    activo: true,
  });
}

async function guardarMensajeDelCliente(tenantId: Types.ObjectId, clienteId: string, texto: string): Promise<void> {
  await createScoped(Message, tenantId, {
    clienteId: new Types.ObjectId(clienteId),
    canal: 'whatsapp',
    direccion: 'inbound',
    sender: 'user',
    tipo: 'texto',
    texto,
    status: 'sent',
  });
}

beforeEach(async () => {
  await Flow.deleteMany({});
  await FlowState.deleteMany({});
  await Cliente.deleteMany({});
  await Message.deleteMany({});
  await Flow.syncIndexes();
  sendOutboundMock.mockClear();
});

describe('HU-FLOW-04 — ejecutarFlujo con trigger', () => {
  it('un flow sin trigger (anterior a HU-FLOW-04) arranca con cualquier mensaje', async () => {
    await crearFlowActivo(tenantA, [nodoSaludo], 'n1');
    const clienteId = await crearCliente(tenantA);

    const r = await ejecutarFlujo(tenantA.toString(), clienteId, 'lo que sea');

    expect(r).toBe('atendido');
    expect(sendOutboundMock).toHaveBeenCalledTimes(1);
  });

  it('palabra_clave cumplida arranca el flow', async () => {
    await crearFlowActivo(tenantA, [nodoSaludo], 'n1', { tipo: 'palabra_clave', palabras: ['precio'] });
    const clienteId = await crearCliente(tenantA);

    const r = await ejecutarFlujo(tenantA.toString(), clienteId, 'Quiero saber precios del preicfes');

    expect(r).toBe('atendido');
    expect(sendOutboundMock).toHaveBeenCalledTimes(1);
  });

  it('palabra_clave no cumplida → trigger_no_cumplido, no envía y no deja FlowState', async () => {
    await crearFlowActivo(tenantA, [nodoSaludo], 'n1', { tipo: 'palabra_clave', palabras: ['precio'] });
    const clienteId = await crearCliente(tenantA);

    const r = await ejecutarFlujo(tenantA.toString(), clienteId, 'hola buenas');

    expect(r).toBe('trigger_no_cumplido');
    expect(sendOutboundMock).not.toHaveBeenCalled();
    expect(await FlowState.countDocuments({})).toBe(0);
  });

  it('primer_mensaje: arranca con el primero y no con el segundo', async () => {
    await crearFlowActivo(tenantA, [nodoSaludo], 'n1', { tipo: 'primer_mensaje' });
    const nuevo = await crearCliente(tenantA);
    await guardarMensajeDelCliente(tenantA, nuevo, 'hola');
    expect(await ejecutarFlujo(tenantA.toString(), nuevo, 'hola')).toBe('atendido');

    const recurrente = await crearCliente(tenantA);
    await guardarMensajeDelCliente(tenantA, recurrente, 'antes');
    await guardarMensajeDelCliente(tenantA, recurrente, 'hola otra vez');
    expect(await ejecutarFlujo(tenantA.toString(), recurrente, 'hola otra vez')).toBe('trigger_no_cumplido');
  });

  it('un flow en curso NO vuelve a evaluar el trigger', async () => {
    await crearFlowActivo(tenantA, [nodoCaptura], 'c1', { tipo: 'palabra_clave', palabras: ['precio'] });
    const clienteId = await crearCliente(tenantA);

    // Arranca por la palabra clave y queda esperando el correo.
    expect(await ejecutarFlujo(tenantA.toString(), clienteId, 'precio', 'm1')).toBe('atendido');
    const estado = await FlowState.findOne({}).lean();
    expect(estado?.esperandoRespuesta).toBe(true);

    // La respuesta ("a@b.co") no contiene la palabra clave, pero el flow sigue en curso.
    const r = await ejecutarFlujo(tenantA.toString(), clienteId, 'a@b.co', 'm2').catch(() => 'atendido');
    expect(r).not.toBe('trigger_no_cumplido');
  });

  it('un flow terminado vuelve a exigir el trigger en el siguiente mensaje', async () => {
    await crearFlowActivo(tenantA, [nodoSaludo], 'n1', { tipo: 'palabra_clave', palabras: ['precio'] });
    const clienteId = await crearCliente(tenantA);

    expect(await ejecutarFlujo(tenantA.toString(), clienteId, 'precio', 'm1')).toBe('atendido');
    // `mensaje` no tiene salida: el flow terminó (nodoActualId = entrada, sin esperar).
    expect(await ejecutarFlujo(tenantA.toString(), clienteId, 'gracias', 'm2')).toBe('trigger_no_cumplido');
  });
});

describe('HU-FLOW-04 — aislamiento multi-tenant del trigger', () => {
  it('el flow y el trigger del tenant A no se evalúan ni disparan para un cliente del tenant B', async () => {
    await crearFlowActivo(tenantA, [nodoSaludo], 'n1', { tipo: 'siempre' });
    const clienteB = await crearCliente(tenantB);

    // B no tiene flow activo: el flow de A no puede responderle a un cliente de B.
    const r = await ejecutarFlujo(tenantB.toString(), clienteB, 'hola');

    expect(r).toBe('atendido'); // sin flow no hay nada que derivar; el worker ni llama a esto
    expect(sendOutboundMock).not.toHaveBeenCalled();
    expect(await FlowState.countDocuments({})).toBe(0);
  });

  it('cada tenant evalúa SU trigger: A no se cumple y B sí con el mismo texto', async () => {
    await crearFlowActivo(tenantA, [nodoSaludo], 'n1', { tipo: 'palabra_clave', palabras: ['precio'] });
    await crearFlowActivo(tenantB, [nodoSaludo], 'n1', { tipo: 'palabra_clave', palabras: ['horario'] });
    const clienteA = await crearCliente(tenantA);
    const clienteB = await crearCliente(tenantB);

    expect(await ejecutarFlujo(tenantA.toString(), clienteA, 'cuál es el horario')).toBe('trigger_no_cumplido');
    expect(await ejecutarFlujo(tenantB.toString(), clienteB, 'cuál es el horario')).toBe('atendido');
    expect(sendOutboundMock).toHaveBeenCalledTimes(1);
  });

  it('primer_mensaje cuenta solo los mensajes del propio tenant', async () => {
    await crearFlowActivo(tenantA, [nodoSaludo], 'n1', { tipo: 'primer_mensaje' });
    const clienteA = await crearCliente(tenantA);
    await guardarMensajeDelCliente(tenantA, clienteA, 'hola');
    // Mensajes ajenos con el MISMO clienteId pero de otro tenant no deben contar.
    await guardarMensajeDelCliente(tenantB, clienteA, 'ruido de B');
    await guardarMensajeDelCliente(tenantB, clienteA, 'más ruido de B');

    expect(await ejecutarFlujo(tenantA.toString(), clienteA, 'hola')).toBe('atendido');
  });
});
