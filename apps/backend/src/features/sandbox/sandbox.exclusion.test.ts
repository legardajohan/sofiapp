/**
 * HU-IA-08, criterio 8: un cliente o lead de prueba no aparece NI CUENTA en ninguna cifra de negocio.
 * Cada caso crea un cliente real y uno de prueba en el mismo tenant y comprueba que solo se ve el real.
 */
import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../cliente/cliente.model.js';
import { Lead } from '../lead/lead.model.js';
import { Message } from '../message/message.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { UserModel } from '../users/user.model.js';
import { seedEstados } from '../../seed/seed-estados.js';

vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn().mockResolvedValue(undefined),
  subscribeRealtime: vi.fn(),
}));
vi.mock('../../config/queues.js', () => ({
  FLOW_RESUME_JOB: 'resume',
  FLOW_REMINDER_JOB: 'reminder',
  flowRuntimeQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import { listConversations } from '../conversation/conversation.service.js';
import { listLeads } from '../lead/lead.service.js';
import { getPipeline } from '../pipeline/pipeline.service.js';
import { getMetricUsed } from '../usage/usage.service.js';
import { buscarCandidatos } from '../flow/flow.reminder.service.js';
import { resumirSegmento } from '../campaign/campaign.segment.service.js';
import { getAdvisorReport } from '../reports/reports.service.js';
import { contarLeadsConEstado } from '../estado/estado.service.js';

const tenantId = new Types.ObjectId().toString();
const tenantOid = new Types.ObjectId(tenantId);
const asesorId = new Types.ObjectId();

async function crearCliente(esPrueba: boolean, extra: Record<string, unknown> = {}) {
  // Un cliente de prueba por admin (índice único parcial): cada uno nace con su propio dueño.
  const owner = extra['pruebaOwnerId'] ?? new Types.ObjectId();
  return Cliente.create({
    tenantId: tenantOid,
    metaUserId: esPrueba ? `prueba-${new Types.ObjectId()}` : `wa_${new Types.ObjectId()}`,
    telefono: esPrueba ? `999${Math.floor(Math.random() * 1e9)}` : `57300${Math.floor(Math.random() * 1e7)}`,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
    iaHabilitada: true,
    marketingOptOut: false,
    ultimoMensajeAt: new Date(),
    ...(esPrueba ? { esPrueba: true, pruebaOwnerId: owner } : {}),
    ...extra,
  });
}

async function crearLead(clienteId: Types.ObjectId, telefono: string, esPrueba: boolean, estado = 'nuevo') {
  return Lead.create({
    tenantId: tenantOid,
    nombre: esPrueba ? 'Lead de prueba' : 'Lead real',
    telefono,
    clienteId,
    origen: { tipo: 'conversacion', conversacionId: clienteId, convertidoPor: asesorId, convertidoAt: new Date() },
    responsableId: asesorId,
    estado,
    ...(esPrueba ? { esPrueba: true } : {}),
  });
}

describe('HU-IA-08 — los datos de prueba no cuentan en ninguna cifra de negocio', () => {
  it('no aparecen en la bandeja', async () => {
    const real = await crearCliente(false);
    await crearCliente(true);

    const r = await listConversations(tenantId, 'asesor-x', { filtro: 'todas', page: 1, limit: 50 } as never);
    const ids = r.data.map((c) => c.id);
    expect(ids).toEqual([String(real._id)]);
  });

  it('no consumen la cuota de leads del plan', async () => {
    await crearCliente(false);
    await crearCliente(true);
    await crearCliente(true);
    expect(await getMetricUsed(tenantId, 'leads')).toBe(1);
  });

  it('no salen en el listado de leads, ni en el tablero, ni en los conteos por etapa', async () => {
    await seedEstados(tenantOid);
    const real = await crearCliente(false);
    const prueba = await crearCliente(true);
    await crearLead(real._id, real.telefono, false);
    await crearLead(prueba._id, prueba.telefono, true);

    const lista = await listLeads(tenantId, { page: 1, limit: 50 } as never);
    expect(lista.total).toBe(1);
    expect(lista.data.map((l) => l.nombre)).toEqual(['Lead real']);

    const tablero = await getPipeline(tenantId, { limit: 50 } as never);
    const enTablero = tablero.columnas.flatMap((c) => c.leads.map((l) => l.nombre));
    expect(enTablero).toEqual(['Lead real']);

    expect(await contarLeadsConEstado(tenantId, 'nuevo')).toBe(1);
  });

  it('el barrido de recordatorios no incluye la conversación de prueba', async () => {
    const dentroDeLaVentana = new Date(Date.now() + 60 * 60 * 1000);
    const real = await crearCliente(false, { ventana24hExpiraEn: dentroDeLaVentana });
    await crearCliente(true, { ventana24hExpiraEn: dentroDeLaVentana });

    const candidatos = await buscarCandidatos(new Date());
    expect(candidatos.map((c) => c.clienteId)).toEqual([String(real._id)]);
  });

  it('no entra en un segmento de campaña', async () => {
    await crearCliente(false);
    await crearCliente(true);

    const resumen = await resumirSegmento(tenantId, {} as never);
    expect(resumen.coinciden).toBe(1);
    expect(resumen.validos).toBe(1);
  });

  it('no cuenta en el reporte por asesor (atendidas, asignadas ni ventas)', async () => {
    await UserModel.create({
      _id: asesorId,
      tenantId: tenantOid,
      nombre: 'Asesora',
      email: `a-${new Types.ObjectId()}@t.com`,
      passwordHash: 'h',
      rol: 'admin',
      activo: true,
    });
    const real = await crearCliente(false, { asesorId });
    const prueba = await crearCliente(true, { asesorId });
    const leadPrueba = await crearLead(prueba._id, prueba.telefono, true, 'pagado');
    const leadReal = await crearLead(real._id, real.telefono, false, 'pagado');

    await Message.create({
      tenantId: tenantOid, clienteId: real._id, canal: 'whatsapp', direccion: 'outbound',
      sender: 'agent', tipo: 'texto', texto: 'hola', metaMessageId: 'm1', status: 'sent',
    });
    await Message.create({
      tenantId: tenantOid, clienteId: prueba._id, canal: 'whatsapp', direccion: 'outbound',
      sender: 'agent', tipo: 'texto', texto: 'hola', metaMessageId: 'prueba-m2', status: 'sent',
    });
    for (const lead of [leadReal, leadPrueba]) {
      await AuditEvent.create({
        tenantId: tenantOid, actorId: asesorId, accion: 'lead.estado', entidad: 'lead',
        entidadId: lead._id, antes: { estado: 'nuevo' }, despues: { estado: 'pagado' },
      });
    }

    const reporte = await getAdvisorReport(tenantId, {} as never);
    const fila = reporte.porAsesor.find((f) => f.asesorId === String(asesorId));
    expect(fila?.conversacionesAtendidas).toBe(1);
    expect(fila?.asignadasActivas).toBe(1);
    expect(fila?.ventas).toBe(1);
  });
});
