import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';

const { sendOutboundMock, chatMock, extractMock, flowRuntimeQueueAddMock } = vi.hoisted(() => ({
  sendOutboundMock: vi.fn().mockResolvedValue({}),
  chatMock: vi.fn(),
  extractMock: vi.fn(),
  flowRuntimeQueueAddMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../message/message.service.js', () => ({ sendOutbound: sendOutboundMock }));
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: chatMock, extract: extractMock }),
}));
// Evita conexión a Redis: `flow.runtime.service.ts` encola en `flowRuntimeQueue` al programar
// una espera (HU-FLOW-02).
vi.mock('../../config/queues.js', () => ({
  FLOW_RESUME_JOB: 'resume',
  FLOW_REMINDER_JOB: 'reminder',
  flowRuntimeQueue: { add: flowRuntimeQueueAddMock },
}));

import { Flow, FlowState } from './flow.model.js';
import { ejecutarFlujo, reanudarFlujo } from './flow.runtime.service.js';
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
  flowRuntimeQueueAddMock.mockClear();
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

const nodoEspera: INodo = {
  id: 'esp1',
  posicion: { x: 0, y: 0 },
  tipo: 'espera',
  config: { tipo: 'espera', minutos: 30 },
};

const nodoFinEspera: INodo = {
  id: 'fin',
  posicion: { x: 0, y: 0 },
  tipo: 'mensaje',
  config: { tipo: 'mensaje', texto: 'Ya volviste' },
};

describe('ejecutarFlujo — nodo espera (HU-FLOW-02)', () => {
  it('programa el job diferido con el delay correcto y guarda un esperaToken', async () => {
    await crearFlowActivo([nodoEspera, nodoFinEspera], [{ id: 'a1', from: 'esp1', to: 'fin' }], 'esp1');
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola');

    expect(flowRuntimeQueueAddMock).toHaveBeenCalledTimes(1);
    const [jobName, jobData, jobOpts] = flowRuntimeQueueAddMock.mock.calls[0] as [
      string,
      { tipo: string; tenantId: string; clienteId: string; token: string },
      { delay: number },
    ];
    expect(jobName).toBe('resume');
    expect(jobData).toMatchObject({ tipo: 'resume', tenantId: tenantId.toString(), clienteId });
    expect(jobOpts.delay).toBe(30 * 60_000);

    const state = await FlowState.findOne({ clienteId }).lean();
    expect(state?.esperaToken).toBe(jobData.token);
    expect(state?.nodoActualId).toBe('esp1');
    expect(state?.esperandoRespuesta).toBe(true);
    expect(sendOutboundMock).not.toHaveBeenCalled();
  });

  it('si encolar falla, no queda un esperaToken huérfano (nada que invalidar)', async () => {
    flowRuntimeQueueAddMock.mockRejectedValueOnce(new Error('Redis caído'));
    await crearFlowActivo([nodoEspera, nodoFinEspera], [{ id: 'a1', from: 'esp1', to: 'fin' }], 'esp1');
    const clienteId = await crearCliente(true);

    await expect(ejecutarFlujo(tenantId.toString(), clienteId, 'hola')).resolves.toBeUndefined();

    const state = await FlowState.findOne({ clienteId }).lean();
    expect(state?.esperaToken).toBeFalsy();
  });
});

describe('reanudarFlujo — HU-FLOW-02', () => {
  it('con el token correcto, avanza al nodo siguiente y limpia el esperaToken', async () => {
    await crearFlowActivo([nodoEspera, nodoFinEspera], [{ id: 'a1', from: 'esp1', to: 'fin' }], 'esp1');
    const clienteId = await crearCliente(true);
    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola');

    const { token } = flowRuntimeQueueAddMock.mock.calls[0]?.[1] as { token: string };
    await reanudarFlujo(tenantId.toString(), clienteId, token);

    expect(sendOutboundMock).toHaveBeenCalledWith(
      tenantId.toString(),
      clienteId,
      expect.objectContaining({ texto: 'Ya volviste' }),
      'bot',
    );
    const state = await FlowState.findOne({ clienteId }).lean();
    expect(state?.esperaToken).toBeFalsy();
    expect(state?.nodoActualId).toBeTruthy();
  });

  it('con un token desparejado (el cliente ya respondió), no hace nada — criterio 3', async () => {
    await crearFlowActivo([nodoEspera, nodoFinEspera], [{ id: 'a1', from: 'esp1', to: 'fin' }], 'esp1');
    const clienteId = await crearCliente(true);
    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola');

    // El cliente responde durante la espera: el token se regenera (o se limpia) al persistir.
    await ejecutarFlujo(tenantId.toString(), clienteId, 'ya volví');
    sendOutboundMock.mockClear();

    const { token: tokenViejo } = flowRuntimeQueueAddMock.mock.calls[0]?.[1] as { token: string };
    await reanudarFlujo(tenantId.toString(), clienteId, tokenViejo);

    expect(sendOutboundMock).not.toHaveBeenCalled();
  });

  it('con iaHabilitada:false no hace nada', async () => {
    await crearFlowActivo([nodoEspera, nodoFinEspera], [{ id: 'a1', from: 'esp1', to: 'fin' }], 'esp1');
    const clienteId = await crearCliente(true);
    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola');
    const { token } = flowRuntimeQueueAddMock.mock.calls[0]?.[1] as { token: string };

    await Cliente.findByIdAndUpdate(clienteId, { iaHabilitada: false });
    sendOutboundMock.mockClear();

    await reanudarFlujo(tenantId.toString(), clienteId, token);

    expect(sendOutboundMock).not.toHaveBeenCalled();
  });
});
