import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { toStoredValue } from '../../utils/field-crypto.util.js';
import { Cliente } from '../cliente/cliente.model.js';
import { ContactNote } from '../contact-note/contact-note.model.js';
import { Lead } from '../lead/lead.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import { User } from '../users/user.model.js';
import { diaEnZona } from './pendiente.fechas.js';

/**
 * Siembra compartida de los tests de HU-PDF-01. Solo para tests: escribe la `createdAt` de las
 * notas directamente en la colección para poder fijar el orden y el rango sin esperar.
 */

let contador = 0;

/** El documento `Tenant` sin pasar por el alta completa: aquí solo importa su `nombre`. */
export async function crearTenant(nombre: string): Promise<Types.ObjectId> {
  const _id = new Types.ObjectId();
  await Tenant.collection.insertOne({ _id, nombre, slug: `${nombre}-${_id.toHexString()}` });
  return _id;
}

export async function crearUsuario(tenantId: Types.ObjectId, nombre: string): Promise<string> {
  contador += 1;
  const doc = await createScoped(User, tenantId, {
    nombre,
    email: `u${contador}_${tenantId.toHexString()}@t.com`,
    passwordHash: 'x',
    rol: 'admin',
    rolEmpresa: 'administrador',
    activo: true,
  });
  return String(doc._id);
}

export async function crearContacto(
  tenantId: Types.ObjectId,
  datos: { nombre?: string; correo?: string; canalOrigen?: string } = {},
): Promise<string> {
  contador += 1;
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_pdf_${contador}`,
    telefono: `57300555${String(contador).padStart(4, '0')}`,
    nombre: datos.nombre,
    correoEnc: datos.correo ? toStoredValue(datos.correo) : undefined,
    canalOrigen: datos.canalOrigen ?? 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
  });
  return String(doc._id);
}

export async function convertirEnLead(
  tenantId: Types.ObjectId,
  clienteId: string,
  responsableId: string,
  datos: { nombre: string; estado: string; correo?: string },
): Promise<string> {
  contador += 1;
  const doc = await createScoped(Lead, tenantId, {
    nombre: datos.nombre,
    telefono: `57311777${String(contador).padStart(4, '0')}`,
    correo: datos.correo,
    clienteId: new Types.ObjectId(clienteId),
    estado: datos.estado,
    responsableId: new Types.ObjectId(responsableId),
    origen: {
      tipo: 'conversacion',
      conversacionId: new Types.ObjectId(clienteId),
      convertidoPor: new Types.ObjectId(responsableId),
      convertidoAt: new Date(),
    },
  });
  return String(doc._id);
}

export async function crearNota(
  tenantId: Types.ObjectId,
  clienteId: string,
  autorId: string,
  texto: string,
  opciones: {
    pendiente?: boolean;
    createdAt?: Date;
    programadoDia?: string;
    programadoHora?: string | null;
    estado?: 'abierto' | 'cerrado';
    cerradoAt?: Date;
  } = {},
): Promise<string> {
  const pendiente = opciones.pendiente ?? true;
  const doc = await createScoped(ContactNote, tenantId, {
    clienteId: new Types.ObjectId(clienteId),
    autorId: new Types.ObjectId(autorId),
    textoEnc: toStoredValue(texto),
    pendiente,
    ...(pendiente
      ? {
          // Igual que el service: sin día elegido, el del alta en Bogotá.
          programadoDia:
            opciones.programadoDia ?? diaEnZona(opciones.createdAt ?? new Date(), 'America/Bogota'),
          programadoHora: opciones.programadoHora ?? null,
          estadoPendiente: opciones.estado ?? 'abierto',
          cerradoAt: opciones.estado === 'cerrado' ? (opciones.cerradoAt ?? new Date()) : null,
          cerradoPorId: opciones.estado === 'cerrado' ? new Types.ObjectId(autorId) : null,
        }
      : {}),
  });
  if (opciones.createdAt) {
    await ContactNote.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: opciones.createdAt } },
    );
  }
  return String(doc._id);
}
