import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../cliente/cliente.model.js';
import { Lead } from '../lead/lead.model.js';
import { Message } from '../message/message.model.js';
import { Flow, FlowState } from '../flow/flow.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import type { INodo } from '../flow/flow.types.js';

// Ni Redis ni BullMQ ni el pipeline de IA: aquí se prueba el chat de prueba, no a Sofi.
const { responderMock, publishMock, reanudarMock } = vi.hoisted(() => ({
  responderMock: vi.fn().mockResolvedValue(undefined),
  publishMock: vi.fn().mockResolvedValue(undefined),
  reanudarMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../workers/inbound-message.processor.js', () => ({ responderAutomaticamente: responderMock }));
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: publishMock,
  subscribeRealtime: vi.fn(),
}));
vi.mock('../flow/flow.runtime.service.js', () => ({
  reanudarFlujo: reanudarMock,
  ejecutarFlujo: vi.fn(),
}));
vi.mock('../../config/queues.js', () => ({
  FLOW_RESUME_JOB: 'resume',
  FLOW_REMINDER_JOB: 'reminder',
  flowRuntimeQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import {
  avanzarEspera,
  barrerSesionesInactivas,
  enviarMensajePrueba,
  obtenerSesion,
  reiniciarSesion,
  seleccionarFlujo,
  telefonoDePrueba,
} from './sandbox.service.js';
import { notificarSaliente } from '../conversation/conversation.service.js';
import type { IMessageSource } from '../conversation/conversation.mapper.js';

const tenantId = new Types.ObjectId().toString();
const adminA = new Types.ObjectId().toString();
const adminB = new Types.ObjectId().toString();

const nodo: INodo = {
  id: 'n1',
  posicion: { x: 0, y: 0 },
  tipo: 'mensaje',
  config: { tipo: 'mensaje', texto: 'Hola' },
};

async function crearFlujo(tenant: string, activo: boolean): Promise<Types.ObjectId> {
  const flujo = await Flow.create({
    tenantId: new Types.ObjectId(tenant),
    nombre: activo ? 'Activo' : 'Borrador',
    activo,
    entrada: 'n1',
    nodos: [nodo],
    aristas: [],
  });
  return flujo._id as Types.ObjectId;
}

describe('sandbox.service — conversación de prueba (HU-IA-08)', () => {
  beforeEach(() => {
    responderMock.mockClear();
    publishMock.mockClear();
    reanudarMock.mockClear();
  });

  it('obtenerSesion crea el cliente de prueba y es idempotente (criterio 1)', async () => {
    const a = await obtenerSesion(tenantId, adminA);
    const b = await obtenerSesion(tenantId, adminA);

    expect(b.clienteId).toBe(a.clienteId);
    expect(a.mensajes).toEqual([]);
    expect(a.iaHabilitada).toBe(true);
    expect(a.flujo).toBeNull();

    const docs = await Cliente.find({ tenantId, esPrueba: true }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]?.metaUserId).toBe(`prueba-${adminA}`);
    expect(String(docs[0]?.pruebaOwnerId)).toBe(adminA);
    expect(docs[0]?.telefono).toBe(telefonoDePrueba(adminA));
    expect(docs[0]?.telefono.startsWith('999')).toBe(true);
  });

  it('dos aperturas simultáneas siguen produciendo una sola sesión (carrera del índice único)', async () => {
    const [a, b] = await Promise.all([obtenerSesion(tenantId, adminA), obtenerSesion(tenantId, adminA)]);
    expect(a.clienteId).toBe(b.clienteId);
    expect(await Cliente.countDocuments({ tenantId, esPrueba: true })).toBe(1);
  });

  it('informa el flujo activo del tenant como el que se probará por defecto', async () => {
    const activo = await crearFlujo(tenantId, true);
    const sesion = await obtenerSesion(tenantId, adminA);
    expect(sesion.flujoActivo).toEqual({ id: String(activo), nombre: 'Activo' });
  });

  it('enviarMensajePrueba guarda el entrante y aplica la misma decisión que WhatsApp (criterio 2)', async () => {
    const { mensaje, trabajo } = await enviarMensajePrueba(tenantId, adminA, 'Hola, ¿precios?');
    await trabajo;

    expect(mensaje.texto).toBe('Hola, ¿precios?');
    const guardados = await Message.find({ tenantId, direccion: 'inbound' }).lean();
    expect(guardados).toHaveLength(1);
    expect(guardados[0]?.metaMessageId?.startsWith('prueba-in-')).toBe(true);

    expect(responderMock).toHaveBeenCalledTimes(1);
    const [tenantArg, clienteArg, entrada] = responderMock.mock.calls[0] as [
      string,
      string,
      { tipo: string; texto: string; mensajeId: string },
    ];
    expect(tenantArg).toBe(tenantId);
    expect(clienteArg).toBe((await obtenerSesion(tenantId, adminA)).clienteId);
    expect(entrada).toMatchObject({ tipo: 'text', texto: 'Hola, ¿precios?' });
    expect(entrada.mensajeId.startsWith('prueba-in-')).toBe(true);
  });

  it('un fallo de la respuesta automática no rompe el envío ni la promesa de trabajo', async () => {
    responderMock.mockRejectedValueOnce(new Error('boom'));
    const { mensaje, trabajo } = await enviarMensajePrueba(tenantId, adminA, 'hola');
    expect(mensaje.texto).toBe('hola');
    await expect(trabajo).resolves.toBeUndefined();
  });

  it('con Sofi apagada (transferido) el mensaje se guarda pero nadie responde', async () => {
    const s = await obtenerSesion(tenantId, adminA);
    await Cliente.updateOne({ _id: s.clienteId }, { iaHabilitada: false });

    const { trabajo } = await enviarMensajePrueba(tenantId, adminA, 'sigo aquí');
    await trabajo;
    expect(responderMock).not.toHaveBeenCalled();
  });

  it('los mensajes de la prueba van SOLO al admin dueño, nunca al room del tenant (criterio 9)', async () => {
    const { mensaje, trabajo } = await enviarMensajePrueba(tenantId, adminA, 'hola');
    await trabajo;

    const tipos = publishMock.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(tipos).toContain('sandbox:message');
    expect(tipos).not.toContain('message:new');
    expect(tipos).not.toContain('conversation:updated');
    const evt = publishMock.mock.calls.find((c) => (c[0] as { type: string }).type === 'sandbox:message')?.[0] as {
      ownerId: string;
      message: { id: string };
    };
    expect(evt.ownerId).toBe(adminA);
    expect(evt.message.id).toBe(mensaje.id);
  });

  it('una respuesta saliente (notificarSaliente) también va solo al dueño', async () => {
    const s = await obtenerSesion(tenantId, adminA);
    const out = await Message.create({
      tenantId: new Types.ObjectId(tenantId),
      clienteId: new Types.ObjectId(s.clienteId),
      canal: 'whatsapp',
      direccion: 'outbound',
      sender: 'bot',
      tipo: 'texto',
      texto: 'Respuesta de Sofi',
      metaMessageId: 'prueba-x',
      status: 'sent',
    });
    publishMock.mockClear();

    await notificarSaliente(tenantId, s.clienteId, out.toObject() as unknown as IMessageSource);

    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock.mock.calls[0]?.[0]).toMatchObject({ type: 'sandbox:message', ownerId: adminA });
  });

  describe('seleccionarFlujo (criterio 5)', () => {
    it('fija el flujo elegido —aunque esté inactivo— y reinicia su FlowState', async () => {
      const borrador = await crearFlujo(tenantId, false);
      const s = await obtenerSesion(tenantId, adminA);
      await FlowState.create({
        tenantId: new Types.ObjectId(tenantId),
        clienteId: new Types.ObjectId(s.clienteId),
        flowId: borrador,
        nodoActualId: 'n1',
        variables: {},
        esperandoRespuesta: true,
      });
      await Cliente.updateOne({ _id: s.clienteId }, { iaHabilitada: false });

      const r = await seleccionarFlujo(tenantId, adminA, String(borrador));

      expect(r.flujo).toEqual({ id: String(borrador), nombre: 'Borrador', activo: false });
      expect(r.iaHabilitada).toBe(true);
      expect(await FlowState.countDocuments({ tenantId })).toBe(0);
    });

    it('null vuelve al flujo activo del tenant', async () => {
      const borrador = await crearFlujo(tenantId, false);
      await seleccionarFlujo(tenantId, adminA, String(borrador));
      const r = await seleccionarFlujo(tenantId, adminA, null);
      expect(r.flujo).toBeNull();
    });

    it('un flujo que no existe responde 404', async () => {
      await expect(seleccionarFlujo(tenantId, adminA, new Types.ObjectId().toString())).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('reiniciarSesion (criterio 6)', () => {
    it('borra el cliente y todo lo que colgó de él, y la siguiente sesión nace vacía', async () => {
      const s = await obtenerSesion(tenantId, adminA);
      const clienteOid = new Types.ObjectId(s.clienteId);
      const { trabajo } = await enviarMensajePrueba(tenantId, adminA, 'hola');
      await trabajo;
      const flujo = await crearFlujo(tenantId, true);
      await FlowState.create({
        tenantId: new Types.ObjectId(tenantId),
        clienteId: clienteOid,
        flowId: flujo,
        nodoActualId: 'n1',
        variables: {},
        esperandoRespuesta: false,
      });
      const lead = await Lead.create({
        tenantId: new Types.ObjectId(tenantId),
        nombre: 'Prueba',
        telefono: telefonoDePrueba(adminA),
        clienteId: clienteOid,
        origen: {
          tipo: 'conversacion',
          conversacionId: clienteOid,
          convertidoPor: new Types.ObjectId(adminA),
          convertidoAt: new Date(),
        },
        responsableId: new Types.ObjectId(adminA),
        esPrueba: true,
      });
      await AuditEvent.create({
        tenantId: new Types.ObjectId(tenantId),
        accion: 'lead.create',
        entidad: 'lead',
        entidadId: lead._id,
      });

      const nueva = await reiniciarSesion(tenantId, adminA);

      expect(nueva.clienteId).not.toBe(s.clienteId);
      expect(nueva.mensajes).toEqual([]);
      expect(await Message.countDocuments({ clienteId: clienteOid })).toBe(0);
      expect(await FlowState.countDocuments({ clienteId: clienteOid })).toBe(0);
      expect(await Lead.countDocuments({ tenantId })).toBe(0);
      expect(await AuditEvent.countDocuments({ tenantId })).toBe(0);
      expect(await Cliente.countDocuments({ _id: clienteOid })).toBe(0);
    });

    it('no toca clientes reales ni la sesión de otro admin', async () => {
      const real = await Cliente.create({
        tenantId: new Types.ObjectId(tenantId),
        metaUserId: 'wa_real',
        telefono: '573001112233',
        canalOrigen: 'whatsapp',
        estadoComercial: 'nuevo',
        customFields: {},
        tagIds: [],
      });
      const sB = await obtenerSesion(tenantId, adminB);
      await obtenerSesion(tenantId, adminA);

      await reiniciarSesion(tenantId, adminA);

      expect(await Cliente.countDocuments({ _id: real._id })).toBe(1);
      expect(await Cliente.countDocuments({ _id: sB.clienteId })).toBe(1);
    });
  });

  describe('avanzarEspera (criterio 7)', () => {
    it('sin espera pendiente responde 409', async () => {
      await obtenerSesion(tenantId, adminA);
      await expect(avanzarEspera(tenantId, adminA)).rejects.toMatchObject({ statusCode: 409 });
      expect(reanudarMock).not.toHaveBeenCalled();
    });

    it('con una espera pendiente reanuda el flujo con su token', async () => {
      const s = await obtenerSesion(tenantId, adminA);
      const flujo = await crearFlujo(tenantId, true);
      await FlowState.create({
        tenantId: new Types.ObjectId(tenantId),
        clienteId: new Types.ObjectId(s.clienteId),
        flowId: flujo,
        nodoActualId: 'n1',
        variables: {},
        esperandoRespuesta: false,
        esperaToken: 'tok-1',
        esperaHasta: new Date(Date.now() + 3_600_000),
      });

      const conEspera = await obtenerSesion(tenantId, adminA);
      expect(conEspera.esperaPendiente).not.toBeNull();

      await avanzarEspera(tenantId, adminA);
      expect(reanudarMock).toHaveBeenCalledWith(tenantId, s.clienteId, 'tok-1');
    });

    it('sin sesión abierta responde 404', async () => {
      await expect(avanzarEspera(tenantId, adminA)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('barrerSesionesInactivas (criterio 12)', () => {
    it('borra solo las sesiones con más de 7 días sin actividad', async () => {
      const vieja = await obtenerSesion(tenantId, adminA);
      const reciente = await obtenerSesion(tenantId, adminB);
      const hace8Dias = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await Cliente.updateOne({ _id: vieja.clienteId }, { pruebaUltimaActividad: hace8Dias });

      const borradas = await barrerSesionesInactivas(new Date());

      expect(borradas).toBe(1);
      expect(await Cliente.countDocuments({ _id: vieja.clienteId })).toBe(0);
      expect(await Cliente.countDocuments({ _id: reciente.clienteId })).toBe(1);
    });
  });
});
