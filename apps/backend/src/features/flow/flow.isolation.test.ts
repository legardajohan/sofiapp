import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped, findOneScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Flow, FlowState } from './flow.model.js';
import { createFlow, getFlowById, listFlows } from './flow.service.js';
import type { INodo } from './flow.types.js';

// `vi.mock` se sube por encima de TODO el módulo, incluidas las `const` de arriba: `vi.hoisted`
// es la forma soportada de tener una referencia al mock disponible dentro de la factory.
const { sendOutboundMock } = vi.hoisted(() => ({ sendOutboundMock: vi.fn().mockResolvedValue({}) }));
vi.mock('../message/message.service.js', () => ({ sendOutbound: sendOutboundMock }));

// El motor no llega a pedir nada async en este flujo (solo `mensaje`), pero se mockea igual para
// que importar el runtime no arrastre una conexión Redis real. `vi.mock` se sube (hoist) por
// encima de los imports estáticos de abajo, así que el import normal ya usa el mock.
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: vi.fn(), extract: vi.fn() }),
}));

import { ejecutarFlujo } from './flow.runtime.service.js';

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
    sendOutboundMock.mockClear();
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
});
