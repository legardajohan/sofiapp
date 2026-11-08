import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { User } from '../users/user.model.js';

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
  await User.deleteMany({});
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

describe('ejecutarFlujo — nodo handoff con asesor elegido', () => {
  async function crearAsesor(activo = true): Promise<string> {
    const doc = await createScoped(User, tenantId, {
      nombre: 'Ana',
      email: `ana${Math.random()}@empresa.test`,
      passwordHash: 'x',
      rol: 'admin',
      activo,
    });
    return String(doc._id);
  }

  it('asigna la conversación al asesor del nodo (manda sobre el reparto automático)', async () => {
    const asesorId = await crearAsesor();
    await crearFlowActivo(
      [{ ...nodoHandoff, config: { tipo: 'handoff', notificarAsesorId: asesorId } }],
      [],
      'h1',
    );
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'necesito un humano');

    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.iaHabilitada).toBe(false);
    expect(String(cliente?.asesorId)).toBe(asesorId);
  });

  it('sin asesor en el nodo, la conversación queda sin dueño (la reparte la configuración general)', async () => {
    await crearFlowActivo([nodoHandoff], [], 'h1');
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'necesito un humano');

    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.asesorId ?? null).toBeNull();
  });

  it('con un asesor ya no válido, el traspaso igual ocurre y no se rompe', async () => {
    const asesorId = await crearAsesor(false);
    await crearFlowActivo(
      [{ ...nodoHandoff, config: { tipo: 'handoff', notificarAsesorId: asesorId } }],
      [],
      'h1',
    );
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'necesito un humano');

    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.iaHabilitada).toBe(false);
    expect(cliente?.asesorId ?? null).toBeNull();
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

    await expect(ejecutarFlujo(tenantId.toString(), clienteId, 'hola')).resolves.toBe('atendido');
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

    await expect(ejecutarFlujo(tenantId.toString(), clienteId, 'hola')).resolves.toBe('atendido');

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

// ─── HU-FLOW-05 · A. Corrección del motor ────────────────────────────────────────

function nodoMsg(id: string, texto: string): INodo {
  return { id, posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto } };
}
function nodoKbFijo(id: string): INodo {
  return {
    id,
    posicion: { x: 0, y: 0 },
    tipo: 'kb',
    config: { tipo: 'kb', pregunta: 'ultimo_mensaje', siNoHayRespuesta: 'No sé.' },
  };
}
function nodoIaSimple(id: string): INodo {
  return {
    id,
    posicion: { x: 0, y: 0 },
    tipo: 'ia',
    config: {
      tipo: 'ia',
      objetivo: 'Asesora al cliente con amabilidad.',
      salidas: [{ etiqueta: 'listo', descripcion: 'El cliente terminó.', nodoDestino: 'fin' }],
      ramaPorDefecto: 'fin',
      maxTurnos: 4,
      usarKb: false,
    },
  };
}

describe('correrMotor — ningún efecto de un turno se pierde (HU-FLOW-05, criterios 1-2)', () => {
  it('kb → ia en el mismo turno: el cliente recibe la respuesta del KB Y LUEGO la del nodo IA', async () => {
    chatMock.mockResolvedValue({ data: 'Respuesta del KB' });
    extractMock.mockResolvedValue({ data: { respuesta: 'Respuesta de la IA', salida: null } });
    await crearFlowActivo(
      [nodoKbFijo('kb1'), nodoIaSimple('ia1'), nodoMsg('fin', 'Adiós')],
      [{ id: 'a1', from: 'kb1', to: 'ia1' }],
      'kb1',
    );
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, '¿Cuánto cuesta?');

    const textos = sendOutboundMock.mock.calls.map((c) => (c[2] as { texto: string }).texto);
    expect(textos).toEqual(['Respuesta del KB', 'Respuesta de la IA']);
  });

  it('accion → ia en el mismo turno: el efecto de la acción se aplica', async () => {
    extractMock.mockResolvedValue({ data: { respuesta: 'Hola', salida: null } });
    const accion: INodo = {
      id: 'ac1',
      posicion: { x: 0, y: 0 },
      tipo: 'accion',
      config: { tipo: 'accion', efecto: { tipo: 'cambiar_estado', estado: 'en_gestion' } },
    };
    await crearFlowActivo(
      [accion, nodoIaSimple('ia1'), nodoMsg('fin', 'Adiós')],
      [{ id: 'a1', from: 'ac1', to: 'ia1' }],
      'ac1',
    );
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola');

    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.estadoComercial).toBe('en_gestion');
  });

  it('al alcanzar el tope de resoluciones con una petición pendiente, los efectos acumulados igual se ejecutan y el estado queda en el nodo pendiente', async () => {
    chatMock.mockResolvedValue({ data: 'kb' });
    extractMock.mockResolvedValue({ data: { intencion: 'x' } });
    // m0 → kb1 → int1 → kb2 → int2 → kb3 → int3: una sola petición pendiente por ronda.
    const ids = ['m0', 'kb1', 'int1', 'kb2', 'int2', 'kb3', 'int3'];
    const intencion = (id: string, destino: string): INodo => ({
      id,
      posicion: { x: 0, y: 0 },
      tipo: 'intencion',
      config: {
        tipo: 'intencion',
        etiquetas: [{ etiqueta: 'x', descripcion: 'cualquiera', nodoDestino: destino }],
        ramaPorDefecto: destino,
      },
    });
    const nodos: INodo[] = [
      nodoMsg('m0', 'Inicio'),
      nodoKbFijo('kb1'),
      intencion('int1', 'kb2'),
      nodoKbFijo('kb2'),
      intencion('int2', 'kb3'),
      nodoKbFijo('kb3'),
      intencion('int3', 'm0'),
    ];
    const aristas: IArista[] = [
      { id: 'a0', from: 'm0', to: 'kb1' },
      { id: 'a1', from: 'kb1', to: 'int1' },
      { id: 'a2', from: 'kb2', to: 'int2' },
      { id: 'a3', from: 'kb3', to: 'int3' },
    ];
    expect(ids).toHaveLength(nodos.length);
    await crearFlowActivo(nodos, aristas, 'm0');
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola');

    // Tras 5 rondas queda pendiente kb3; los envíos de las rondas previas (m0, kb1, kb2) se ejecutan.
    const textos = sendOutboundMock.mock.calls.map((c) => (c[2] as { texto: string }).texto);
    expect(textos).toEqual(['Inicio', 'kb', 'kb']);
    const state = await FlowState.findOne({ clienteId }).lean();
    expect(state?.nodoActualId).toBe('kb3');
  });

  it('una captura fallida cuesta UNA sola llamada de extracción y sigue esperando', async () => {
    extractMock.mockResolvedValue({ data: {} });
    const captura: INodo = {
      id: 'c1',
      posicion: { x: 0, y: 0 },
      tipo: 'captura',
      config: {
        tipo: 'captura',
        campo: 'grado',
        descripcion: 'Grado escolar',
        tipoDato: 'texto',
        pregunta: '¿En qué grado va?',
        reintentos: 0,
      },
    };
    await crearFlowActivo([captura, nodoMsg('fin', 'Gracias')], [{ id: 'a1', from: 'c1', to: 'fin' }], 'c1');
    const clienteId = await crearCliente(true);

    await ejecutarFlujo(tenantId.toString(), clienteId, 'hola'); // hace la pregunta
    await ejecutarFlujo(tenantId.toString(), clienteId, 'no sé'); // la IA no extrae nada

    expect(extractMock).toHaveBeenCalledTimes(1);
    const state = await FlowState.findOne({ clienteId }).lean();
    expect(state?.nodoActualId).toBe('c1');
    expect(state?.esperandoRespuesta).toBe(true);
  });
});
