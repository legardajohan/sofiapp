import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { Flow, FlowState } from '../flow/flow.model.js';

vi.mock('../../workers/inbound-message.processor.js', () => ({
  responderAutomaticamente: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn().mockResolvedValue(undefined),
  subscribeRealtime: vi.fn(),
}));
vi.mock('../flow/flow.runtime.service.js', () => ({
  reanudarFlujo: vi.fn().mockResolvedValue(undefined),
  ejecutarFlujo: vi.fn(),
}));
vi.mock('../../config/queues.js', () => ({
  FLOW_RESUME_JOB: 'resume',
  FLOW_REMINDER_JOB: 'reminder',
  flowRuntimeQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import {
  avanzarEspera,
  enviarMensajePrueba,
  obtenerSesion,
  reiniciarSesion,
  seleccionarFlujo,
} from './sandbox.service.js';

const tenantA = new Types.ObjectId().toString();
const tenantB = new Types.ObjectId().toString();
const adminA1 = new Types.ObjectId().toString();
const adminA2 = new Types.ObjectId().toString();
const adminB = new Types.ObjectId().toString();

async function crearFlujo(tenant: string): Promise<string> {
  const f = await Flow.create({
    tenantId: new Types.ObjectId(tenant),
    nombre: 'Flujo',
    activo: false,
    entrada: 'n1',
    nodos: [{ id: 'n1', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Hola' } }],
    aristas: [],
  });
  return String(f._id);
}

describe('HU-IA-08 — aislamiento multi-tenant del chat de prueba', () => {
  it('cada tenant tiene su propia sesión, aunque el userId coincidiera', async () => {
    const a = await obtenerSesion(tenantA, adminA1);
    // El mismo userId en otro tenant (imposible en producción, pero el aislamiento no debe depender de ello).
    const b = await obtenerSesion(tenantB, adminA1);

    expect(a.clienteId).not.toBe(b.clienteId);
    const deA = await Cliente.findById(a.clienteId).lean();
    const deB = await Cliente.findById(b.clienteId).lean();
    expect(String(deA?.tenantId)).toBe(tenantA);
    expect(String(deB?.tenantId)).toBe(tenantB);
  });

  it('reiniciar en el tenant B no toca la sesión del tenant A', async () => {
    const a = await obtenerSesion(tenantA, adminA1);
    const { trabajo } = await enviarMensajePrueba(tenantA, adminA1, 'mensaje de A');
    await trabajo;
    await obtenerSesion(tenantB, adminA1);

    await reiniciarSesion(tenantB, adminA1);

    expect(await Cliente.countDocuments({ _id: a.clienteId })).toBe(1);
    expect(await Message.countDocuments({ tenantId: tenantA })).toBe(1);
  });

  it('un admin no ve ni escribe en la sesión de otro admin del mismo tenant', async () => {
    const s1 = await obtenerSesion(tenantA, adminA1);
    const { trabajo } = await enviarMensajePrueba(tenantA, adminA1, 'privado de A1');
    await trabajo;

    const s2 = await obtenerSesion(tenantA, adminA2);

    expect(s2.clienteId).not.toBe(s1.clienteId);
    expect(s2.mensajes).toEqual([]);
    expect((await obtenerSesion(tenantA, adminA1)).mensajes).toHaveLength(1);
  });

  it('un admin del tenant B no puede avanzar la espera de la sesión del tenant A', async () => {
    const s = await obtenerSesion(tenantA, adminA1);
    const flowId = await crearFlujo(tenantA);
    await FlowState.create({
      tenantId: new Types.ObjectId(tenantA),
      clienteId: new Types.ObjectId(s.clienteId),
      flowId: new Types.ObjectId(flowId),
      nodoActualId: 'n1',
      variables: {},
      esperandoRespuesta: false,
      esperaToken: 'tok',
      esperaHasta: new Date(Date.now() + 60_000),
    });

    // Para B no existe sesión abierta: 404, nunca un 403 que confirmaría la existencia de la de A.
    await expect(avanzarEspera(tenantB, adminB)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('elegir un flujo de otro tenant responde 404 y no lo fija', async () => {
    const flujoDeA = await crearFlujo(tenantA);
    await obtenerSesion(tenantB, adminB);

    await expect(seleccionarFlujo(tenantB, adminB, flujoDeA)).rejects.toMatchObject({ statusCode: 404 });

    const cliente = await Cliente.findOne({ tenantId: tenantB, esPrueba: true }).lean();
    expect(cliente?.pruebaFlowId ?? null).toBeNull();
  });

  it('el flujo elegido de un tenant nunca se resuelve para el cliente de prueba de otro', async () => {
    const flujoDeA = await crearFlujo(tenantA);
    // Se fuerza el id ajeno directamente en el documento, saltándose la validación del service.
    const s = await obtenerSesion(tenantB, adminB);
    await Cliente.updateOne({ _id: s.clienteId }, { pruebaFlowId: flujoDeA });

    const sesion = await obtenerSesion(tenantB, adminB);
    expect(sesion.flujo).toBeNull();
  });
});
