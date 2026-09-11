import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped, findOneScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { Flow, FlowState } from './flow.model.js';
import { createFlow, getFlowById, listFlows } from './flow.service.js';
import type { INodo } from './flow.types.js';

// `vi.mock` se sube por encima de TODO el módulo, incluidas las `const` de arriba: `vi.hoisted`
// es la forma soportada de tener una referencia al mock disponible dentro de la factory.
const { sendOutboundMock, extractMock, searchKnowledgeMock } = vi.hoisted(() => ({
  sendOutboundMock: vi.fn().mockResolvedValue({}),
  extractMock: vi.fn(),
  searchKnowledgeMock: vi.fn().mockResolvedValue([]),
}));
vi.mock('../message/message.service.js', () => ({ sendOutbound: sendOutboundMock }));

// El motor no llega a pedir nada async en este flujo (solo `mensaje`), pero se mockea igual para
// que importar el runtime no arrastre una conexión Redis real. `vi.mock` se sube (hoist) por
// encima de los imports estáticos de abajo, así que el import normal ya usa el mock.
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: vi.fn(), extract: extractMock }),
}));
// HU-FLOW-03: el nodo `ia` consulta la KB tenant-scoped cuando `usarKb` es `true`.
vi.mock('../kb/kb.retrieval.service.js', () => ({ searchKnowledge: searchKnowledgeMock }));
// `flow.runtime.service.ts` importa `flowRuntimeQueue` desde HU-FLOW-02: se mockea por la misma
// razón (evitar una conexión a Redis real al importar el runtime).
vi.mock('../../config/queues.js', () => ({
  FLOW_RESUME_JOB: 'resume',
  FLOW_REMINDER_JOB: 'reminder',
  flowRuntimeQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import { ejecutarFlujo, reanudarFlujo } from './flow.runtime.service.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

const nodoSaludo: INodo = {
  id: 'n1',
  posicion: { x: 0, y: 0 },
  tipo: 'mensaje',
  config: { tipo: 'mensaje', texto: 'Hola desde A' },
};

async function crearCliente(tenantId: Types.ObjectId): Promise<string> {
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_iso_${tenantId.toString()}`,
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
    iaHabilitada: true,
  });
  return String(doc._id);
}

describe('HU-FLOW-01-V2 — aislamiento multi-tenant', () => {
  beforeEach(async () => {
    await Flow.deleteMany({});
    await FlowState.deleteMany({});
    await Cliente.deleteMany({});
    await Flow.syncIndexes();
    await FlowState.syncIndexes();
    await Message.deleteMany({});
    sendOutboundMock.mockClear();
    extractMock.mockReset();
    searchKnowledgeMock.mockReset();
    searchKnowledgeMock.mockResolvedValue([]);
  });

  it('un flujo creado bajo tenantA no aparece en el listado de tenantB', async () => {
    await createFlow(tenantA, { nombre: 'Solo de A', nodos: [nodoSaludo], aristas: [], entrada: 'n1' });

    const listadoB = await listFlows(tenantB);
    expect(listadoB).toHaveLength(0);

    const listadoA = await listFlows(tenantA);
    expect(listadoA).toHaveLength(1);
  });

  it('getFlowById de un flujo de A con tenantB → 404 (nunca 403), y el flujo sigue intacto', async () => {
    const creado = await createFlow(tenantA, {
      nombre: 'Solo de A',
      nodos: [nodoSaludo],
      aristas: [],
      entrada: 'n1',
    });

    await expect(getFlowById(tenantB, creado.id)).rejects.toMatchObject({ statusCode: 404 });

    const intacto = await findByIdScoped(Flow, tenantA, creado.id).lean();
    expect(intacto?.nombre).toBe('Solo de A');
  });

  it('ejecutarFlujo(tenantB, clienteDeB, ...) no resuelve el flujo activo de tenantA', async () => {
    await createFlow(tenantA, {
      nombre: 'Activo de A',
      nodos: [nodoSaludo],
      aristas: [],
      entrada: 'n1',
      activo: true,
    });
    const clienteB = await crearCliente(tenantB);

    await ejecutarFlujo(tenantB.toString(), clienteB, 'hola');

    // Si hubiera resuelto el flujo de A, habría enviado "Hola desde A" por `sendOutbound`.
    expect(sendOutboundMock).not.toHaveBeenCalled();
    // Y no debe haber quedado ningún FlowState creado para un flujo ajeno.
    expect(await FlowState.countDocuments({ tenantId: tenantB })).toBe(0);
  });

  it('el FlowState de una conversación de A no es legible ni modificable desde B', async () => {
    const flowA = await createFlow(tenantA, {
      nombre: 'Activo de A',
      nodos: [nodoSaludo],
      aristas: [],
      entrada: 'n1',
      activo: true,
    });
    const clienteA = await crearCliente(tenantA);

    await ejecutarFlujo(tenantA.toString(), clienteA, 'hola');
    expect(await FlowState.countDocuments({ tenantId: tenantA })).toBe(1);

    // El repositorio scoped de B no puede ver el FlowState de A: buscando por su propio tenant no
    // aparece nada, aunque el `clienteId`/`flowId` reales existan.
    const desdeB = await findOneScoped(FlowState, tenantB, {
      clienteId: new Types.ObjectId(clienteA),
      flowId: new Types.ObjectId(flowA.id),
    }).lean();
    expect(desdeB).toBeNull();
  });

  it('reanudarFlujo(tenantB, clienteDeA, token) no toca el FlowState de A (HU-FLOW-02)', async () => {
    const nodoEspera: INodo = {
      id: 'esp1',
      posicion: { x: 0, y: 0 },
      tipo: 'espera',
      config: { tipo: 'espera', minutos: 10 },
    };
    await createFlow(tenantA, { nombre: 'Con espera', nodos: [nodoEspera], aristas: [], entrada: 'esp1', activo: true });
    const clienteA = await crearCliente(tenantA);
    await ejecutarFlujo(tenantA.toString(), clienteA, 'hola');

    const estadoAntes = await FlowState.findOne({ tenantId: tenantA, clienteId: new Types.ObjectId(clienteA) }).lean();
    expect(estadoAntes?.esperaToken).toBeTruthy();

    // Con el tenant equivocado, `findOneScoped` no encuentra el FlowState de A: no hace nada,
    // aunque `token` y `clienteId` sean exactamente los correctos.
    await reanudarFlujo(tenantB.toString(), clienteA, estadoAntes!.esperaToken as string);

    const estadoDespues = await FlowState.findOne({ tenantId: tenantA, clienteId: new Types.ObjectId(clienteA) }).lean();
    expect(estadoDespues?.esperaToken).toBe(estadoAntes?.esperaToken);
    expect(sendOutboundMock).not.toHaveBeenCalled();
  });

  it('dos tenants pueden tener a la vez su propio flujo activo sin violar el índice parcial único', async () => {
    await expect(
      createFlow(tenantA, { nombre: 'Activo A', nodos: [nodoSaludo], aristas: [], entrada: 'n1', activo: true }),
    ).resolves.toBeDefined();

    await expect(
      createFlow(tenantB, { nombre: 'Activo B', nodos: [nodoSaludo], aristas: [], entrada: 'n1', activo: true }),
    ).resolves.toBeDefined();

    expect(await Flow.countDocuments({ tenantId: tenantA, activo: true })).toBe(1);
    expect(await Flow.countDocuments({ tenantId: tenantB, activo: true })).toBe(1);
  });

  describe('nodo ia — aislamiento multi-tenant (HU-FLOW-03)', () => {
    const nodoIa: INodo = {
      id: 'ia1',
      posicion: { x: 0, y: 0 },
      tipo: 'ia',
      config: {
        tipo: 'ia',
        objetivo: 'Averiguar si el cliente quiere comprar.',
        salidas: [{ etiqueta: 'quiere_comprar', descripcion: 'Confirma intención de compra', nodoDestino: 'fin' }],
        ramaPorDefecto: 'default',
        maxTurnos: 3,
        usarKb: true,
      },
    };
    const nodoFin: INodo = { id: 'fin', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Listo' } };
    const nodoDefault: INodo = { id: 'default', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Fin' } };

    it('el historial y la KB que alimentan la respuesta del nodo ia de A nunca son los de B', async () => {
      extractMock.mockResolvedValue({ data: { respuesta: 'ok', salida: 'quiere_comprar' } });

      await createFlow(tenantA, {
        nombre: 'Con nodo ia',
        nodos: [nodoIa, nodoFin, nodoDefault],
        aristas: [],
        entrada: 'ia1',
        activo: true,
      });
      const clienteA = await crearCliente(tenantA);
      const clienteB = await crearCliente(tenantB);

      // Mensajes previos SOLO del cliente de B, con el mismo `clienteId` shape pero tenant distinto.
      await createScoped(Message, tenantB, {
        clienteId: new Types.ObjectId(clienteB),
        canal: 'whatsapp',
        direccion: 'inbound',
        sender: 'user',
        tipo: 'text',
        texto: 'Mensaje secreto de B',
        status: 'sent',
      });

      await ejecutarFlujo(tenantA.toString(), clienteA, 'hola desde A');

      // El tenantId con el que se llamó a AIService.extract y a searchKnowledge es el de A, nunca el de B.
      expect(extractMock).toHaveBeenCalledTimes(1);
      const [extractParams] = extractMock.mock.calls[0] as [{ tenantId: Types.ObjectId; historial: { content: string }[] }];
      expect(extractParams.tenantId.toString()).toBe(tenantA.toString());
      expect(extractParams.historial.some((h) => h.content.includes('Mensaje secreto de B'))).toBe(false);

      expect(searchKnowledgeMock).toHaveBeenCalledWith(tenantA.toString(), 'hola desde A');
    });
  });
});
