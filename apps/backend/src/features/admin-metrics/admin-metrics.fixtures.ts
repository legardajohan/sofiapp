import { Types } from 'mongoose';
import { Tenant } from '../tenant/tenant.model.js';
import { Plan } from '../plan/plan.model.js';
import { User } from '../users/user.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { Lead } from '../lead/lead.model.js';
import { Campaign } from '../campaign/campaign.model.js';

/*
 * Fixtures de los tests de HU-SAAS-03 (solo tests). Se insertan con `Model.collection.insertMany`
 * —el driver, sin Mongoose— para poder fijar `createdAt` a mano: los agregados del tablero filtran
 * por fecha y `timestamps` lo sobrescribiría. Ningún código de producción importa este archivo.
 */

export interface MetricsSeed {
  usuarios?: number;
  usuariosInactivos?: number;
  clientes?: number;
  mensajesIn?: number;
  mensajesOut?: number;
  leads?: number;
  ventas?: number;
  campanas?: number;
  createdAt?: Date;
  ultimoMensajeAt?: Date;
}

const rep = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

export async function crearPlan(nombre: string): Promise<Types.ObjectId> {
  const _id = new Types.ObjectId();
  await Plan.collection.insertOne({ _id, nombre, activo: true, createdAt: new Date(), updatedAt: new Date() });
  return _id;
}

export async function crearTenant(
  nombre: string,
  opts: { estado?: 'activo' | 'suspendido' | 'prueba'; planId?: Types.ObjectId } = {},
): Promise<Types.ObjectId> {
  const _id = new Types.ObjectId();
  await Tenant.collection.insertOne({
    _id,
    nombre,
    slug: nombre.toLowerCase().replace(/\s+/g, '-'),
    contacto: { email: 'c@x.test', telefono: '1' },
    estado: opts.estado ?? 'activo',
    ...(opts.planId ? { planId: opts.planId } : {}),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return _id;
}

/** Siembra datos de un tenant. Los nombres/teléfonos/textos llevan `marca` para buscar fugas de PII. */
export async function sembrar(tenantId: Types.ObjectId | null, marca: string, s: MetricsSeed): Promise<void> {
  const createdAt = s.createdAt ?? new Date();
  const ultimoMensajeAt = s.ultimoMensajeAt ?? createdAt;
  const ventas = s.ventas ?? 0;
  const usuarios = [
    ...rep(s.usuarios ?? 0, () => true),
    ...rep(s.usuariosInactivos ?? 0, () => false),
  ].map((activo, i) => ({
    tenantId,
    nombre: `Usuario ${marca} ${i}`,
    email: `${marca}-${i}-${new Types.ObjectId().toString()}@pii.test`,
    passwordHash: 'x',
    rol: 'admin',
    activo,
    createdAt,
  }));
  if (usuarios.length) await User.collection.insertMany(usuarios);
  if (!tenantId) return;

  const clientes = rep(s.clientes ?? 0, (i) => ({
    tenantId,
    metaUserId: `wa_${marca}_${i}_${new Types.ObjectId().toString()}`,
    telefono: `57300${marca}${i}`,
    nombre: `Contacto ${marca} ${i}`,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    ultimoMensajeAt,
    createdAt,
  }));
  if (clientes.length) await Cliente.collection.insertMany(clientes);

  const clienteId = new Types.ObjectId();
  const mensajes = [
    ...rep(s.mensajesIn ?? 0, () => 'inbound'),
    ...rep(s.mensajesOut ?? 0, () => 'outbound'),
  ].map((direccion, i) => ({
    tenantId,
    clienteId,
    canal: 'whatsapp',
    direccion,
    sender: 'user',
    tipo: 'texto',
    texto: `Mensaje secreto ${marca} ${i}`,
    createdAt,
  }));
  if (mensajes.length) await Message.collection.insertMany(mensajes);

  const leads = rep(s.leads ?? 0, (i) => ({
    tenantId,
    nombre: `Lead ${marca} ${i}`,
    telefono: `57311${marca}${i}`,
    clienteId,
    responsableId: new Types.ObjectId(),
    estado: i < ventas ? 'pagado' : 'nuevo',
    createdAt,
  }));
  if (leads.length) await Lead.collection.insertMany(leads);

  const campanas = rep(s.campanas ?? 0, (i) => ({
    tenantId,
    nombre: `Campaña ${marca} ${i}`,
    templateId: new Types.ObjectId(),
    creadaPor: new Types.ObjectId(),
    estado: i % 2 === 0 ? 'completada' : 'borrador',
    createdAt,
  }));
  if (campanas.length) await Campaign.collection.insertMany(campanas);
}
