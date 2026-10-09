import { Types } from 'mongoose';
import { User } from '../users/user.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { Lead } from '../lead/lead.model.js';
import { AuditEvent } from '../audit/audit.model.js';

/*
 * Fixtures de los tests de HU-REP-01 (solo tests). Se insertan con `Model.collection` —el driver,
 * sin Mongoose— para fijar `createdAt` a mano: el reporte filtra por fechas y `timestamps` las
 * sobrescribiría. Ningún código de producción importa este archivo.
 */

type Oid = Types.ObjectId;

export async function crearAsesor(
  tenantId: Oid,
  nombre: string,
  opts: { activo?: boolean } = {},
): Promise<Oid> {
  const _id = new Types.ObjectId();
  await User.collection.insertOne({
    _id,
    tenantId,
    nombre,
    email: `${nombre.toLowerCase().replace(/\s+/g, '.')}.${_id.toString()}@pii.test`,
    passwordHash: 'x',
    rol: 'admin',
    activo: opts.activo ?? true,
    createdAt: new Date(),
  });
  return _id;
}

let seq = 0;

/** Un hilo (`Cliente`). `demo` usa el prefijo `demo-` del seed de la bandeja. */
export async function crearHilo(
  tenantId: Oid,
  asesorId: Oid | null,
  opts: { demo?: boolean; ultimoMensajeAt?: Date } = {},
): Promise<Oid> {
  const _id = new Types.ObjectId();
  seq += 1;
  await Cliente.collection.insertOne({
    _id,
    tenantId,
    metaUserId: `${opts.demo ? 'demo-' : 'wa_'}${seq}_${_id.toString()}`,
    telefono: `573009${String(seq).padStart(5, '0')}`,
    nombre: `Contacto secreto ${seq}`,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    asesorId,
    ...(opts.ultimoMensajeAt ? { ultimoMensajeAt: opts.ultimoMensajeAt } : {}),
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
  return _id;
}

export async function crearMensaje(
  tenantId: Oid,
  clienteId: Oid,
  sender: 'agent' | 'bot' | 'user',
  createdAt: Date,
): Promise<void> {
  await Message.collection.insertOne({
    tenantId,
    clienteId,
    canal: 'whatsapp',
    direccion: sender === 'user' ? 'inbound' : 'outbound',
    sender,
    tipo: 'texto',
    texto: 'Texto privado del mensaje',
    createdAt,
  });
}

/** Lead en su estado ACTUAL `estado`, con sus transiciones de etapa ya auditadas. */
export async function crearLead(
  tenantId: Oid,
  responsableId: Oid | null,
  estado: string,
  transiciones: Array<{ a: string; at: Date; accion?: 'lead.estado' | 'lead.update' }> = [],
): Promise<Oid> {
  const _id = new Types.ObjectId();
  seq += 1;
  await Lead.collection.insertOne({
    _id,
    tenantId,
    nombre: `Lead secreto ${seq}`,
    telefono: `573118${String(seq).padStart(5, '0')}`,
    clienteId: new Types.ObjectId(),
    responsableId,
    estado,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
  let antes = 'nuevo';
  for (const t of transiciones) {
    await AuditEvent.collection.insertOne({
      tenantId,
      actorId: new Types.ObjectId(),
      accion: t.accion ?? 'lead.estado',
      entidad: 'lead',
      entidadId: _id,
      antes: { estado: antes },
      despues: { estado: t.a },
      createdAt: t.at,
    });
    antes = t.a;
  }
  return _id;
}

/** Un handoff automático (HU-IA-03) tal como lo audita `handoffConversation`: actor `null`. */
export async function crearHandoff(
  tenantId: Oid,
  clienteId: Oid,
  createdAt: Date,
  motivo = 'explicit_request',
  condicion: string | null = null,
): Promise<void> {
  await AuditEvent.collection.insertOne({
    tenantId,
    actorId: null,
    accion: 'conversation.handoff',
    entidad: 'cliente',
    entidadId: clienteId,
    antes: { iaHabilitada: true, asignadoA: null },
    despues: { iaHabilitada: false, asignadoA: null, motivo, condicion },
    createdAt,
  });
}
