import { Types } from 'mongoose';
import {
  countScoped,
  createScoped,
  findByIdScoped,
  findOneAndDeleteScoped,
  findOneAndUpdateScoped,
  findOneScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { fromStoredValue, toStoredValue } from '../../utils/field-crypto.util.js';
import { Cliente } from '../cliente/cliente.model.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { findUsersByIds } from '../users/user.service.js';
import type { IUserResponse } from '../users/user.types.js';
import type { IPaginated } from '../conversation/conversation.types.js';
import { diaEnZona } from '../pendiente/pendiente.fechas.js';
import { ContactNote } from './contact-note.model.js';
import type { IContactNote, IContactNoteLean, INotaResponse } from './contact-note.types.js';
import type { UpdateNotaBody } from './contact-note.validation.js';

type TenantId = string | Types.ObjectId;

/** Lo que acepta `updateNota`: el body validado, con `tz` opcional para llamadas internas. */
export type CambiosNota = Omit<UpdateNotaBody, 'tz'> & { tz?: string };

/** Lo que define a un pendiente más allá del texto. `null` en todo cuando la nota no lo es. */
type CamposPendiente = Pick<
  IContactNote,
  'pendiente' | 'programadoDia' | 'programadoHora' | 'estadoPendiente' | 'cerradoAt' | 'cerradoPorId'
>;

const SIN_PENDIENTE: CamposPendiente = {
  pendiente: false,
  programadoDia: null,
  programadoHora: null,
  estadoPendiente: null,
  cerradoAt: null,
  cerradoPorId: null,
};

function toNotaResponse(
  nota: IContactNoteLean,
  userMap: Map<string, IUserResponse>,
): INotaResponse {
  const autorId = String(nota.autorId);
  const pendiente = nota.pendiente ?? false;
  return {
    id: String(nota._id),
    texto: fromStoredValue(nota.textoEnc),
    autor: { id: autorId, nombre: userMap.get(autorId)?.nombre ?? null },
    // Las notas anteriores a HU-PDF-01 no tienen el campo: cuentan como nota normal.
    pendiente,
    programadoDia: pendiente ? (nota.programadoDia ?? null) : null,
    programadoHora: pendiente ? (nota.programadoHora ?? null) : null,
    estadoPendiente: pendiente ? (nota.estadoPendiente ?? 'abierto') : null,
    cerradoAt: pendiente && nota.cerradoAt ? nota.cerradoAt.toISOString() : null,
    createdAt: nota.createdAt.toISOString(),
    updatedAt: (nota.updatedAt ?? nota.createdAt).toISOString(),
  };
}

/** Lo que la auditoría guarda de un pendiente: su forma, nunca el texto. */
function resumenAuditoria(campos: Partial<CamposPendiente>): Record<string, unknown> {
  return {
    pendiente: campos.pendiente ?? false,
    programadoDia: campos.programadoDia ?? null,
    programadoHora: campos.programadoHora ?? null,
    estadoPendiente: campos.estadoPendiente ?? null,
  };
}

/**
 * Comprueba que el contacto existe **en este tenant** antes de tocar nada. El `clienteId` viene de
 * la URL y es la única vía por la que un id ajeno podría entrar; `findByIdScoped` devuelve `null`
 * tanto si no existe como si es de otro tenant, y esa indistinguibilidad ES la garantía de
 * aislamiento: nunca un 403, que confirmaría la existencia del recurso ajeno.
 */
async function assertContactoDelTenant(tenantId: TenantId, clienteId: string): Promise<void> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).select({ _id: 1 }).lean();
  if (!cliente) throw new AppError('Contacto no encontrado.', 404);
}

export interface OpcionesNuevaNota {
  pendiente?: boolean;
  programadoDia?: string;
  programadoHora?: string;
  /** Zona del navegador: decide qué día es «hoy» cuando no se elige fecha (RN10). */
  tz?: string;
}

export async function createNota(
  tenantId: TenantId,
  autorId: string,
  clienteId: string,
  texto: string,
  opciones: OpcionesNuevaNota = {},
): Promise<INotaResponse> {
  await assertContactoDelTenant(tenantId, clienteId);

  const campos: CamposPendiente = opciones.pendiente
    ? {
        pendiente: true,
        // RN10: sin fecha elegida, el pendiente es del día en que se crea para quien lo crea.
        programadoDia: opciones.programadoDia ?? diaEnZona(new Date(), opciones.tz ?? 'America/Bogota'),
        programadoHora: opciones.programadoHora ?? null,
        estadoPendiente: 'abierto',
        cerradoAt: null,
        cerradoPorId: null,
      }
    : SIN_PENDIENTE;

  const creada = await createScoped(ContactNote, tenantId, {
    clienteId: new Types.ObjectId(clienteId),
    autorId: new Types.ObjectId(autorId),
    textoEnc: toStoredValue(texto),
    ...campos,
  });

  // `as unknown as`: `createdAt` lo pone Mongoose vía `timestamps` y no está en `IContactNote`.
  const nota = creada.toObject() as unknown as IContactNoteLean;

  // La bitácora registra que se creó una nota, jamás su contenido: `audit_events` no tiene gate por
  // subrol y volcar ahí el texto lo dejaría al alcance de quien no puede ver la nota.
  await recordAuditEvent(tenantId, {
    actorId: autorId,
    accion: 'contact-note.create',
    entidad: 'contact-note',
    entidadId: String(nota._id),
    antes: {},
    despues: { clienteId, ...resumenAuditoria(campos) },
  });

  const userMap = await findUsersByIds(tenantId, [autorId]);
  return toNotaResponse(nota, userMap);
}

/** Notas del contacto, más reciente primero. Apoyada en `{ tenantId, clienteId, createdAt: -1 }`. */
export async function listNotas(
  tenantId: TenantId,
  clienteId: string,
  page: number,
  limit: number,
): Promise<IPaginated<INotaResponse>> {
  await assertContactoDelTenant(tenantId, clienteId);

  const filter = { clienteId: new Types.ObjectId(clienteId) };
  const [docs, total] = await Promise.all([
    findScoped(ContactNote, tenantId, filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<IContactNoteLean[]>(),
    countScoped(ContactNote, tenantId, filter),
  ]);

  // Autores en lote: una consulta por página, no una por nota (mismo patrón que HU-OMNI-02).
  const userMap = await findUsersByIds(tenantId, docs.map((d) => String(d.autorId)));

  return { data: docs.map((d) => toNotaResponse(d, userMap)), page, limit, total };
}

/**
 * Filtro de una nota concreta **de un contacto concreto**. El `clienteId` entra en el filtro y no
 * solo en la URL: sin él, `/clientes/<X>/notas/<nota de Y>` tocaría una nota de otro contacto del
 * mismo tenant. El `tenantId` lo añade el repositorio.
 */
function filtroNota(clienteId: string, notaId: string): Record<string, Types.ObjectId> {
  return { _id: new Types.ObjectId(notaId), clienteId: new Types.ObjectId(clienteId) };
}

/**
 * Qué campos del pendiente cambian, a partir de cómo está la nota y de lo que pide el cliente.
 * Puro, para que las reglas (RN4, RN9, RN10) se lean en un solo sitio.
 */
function cambiosDePendiente(
  previa: IContactNoteLean,
  cambios: CambiosNota,
): Partial<CamposPendiente> {
  const eraPendiente = previa.pendiente ?? false;
  const programa = cambios.programadoDia !== undefined || cambios.programadoHora !== undefined;

  // RN4 + RN9: quitar el interruptor borra la programación y el cierre.
  if (cambios.pendiente === false) return eraPendiente ? SIN_PENDIENTE : {};

  // Encender el pendiente en una nota que no lo era: nace abierto y programado (RN10).
  if (cambios.pendiente === true && !eraPendiente) {
    return {
      pendiente: true,
      programadoDia: cambios.programadoDia ?? diaEnZona(new Date(), cambios.tz ?? 'America/Bogota'),
      programadoHora: cambios.programadoHora ?? null,
      estadoPendiente: 'abierto',
      cerradoAt: null,
      cerradoPorId: null,
    };
  }

  if (!programa) return {};
  // Reprogramar algo que no es pendiente no tiene sentido (CA14).
  if (!eraPendiente) throw new AppError('Activa el pendiente para poder programarlo.', 422);

  const set: Partial<CamposPendiente> = {};
  if (cambios.programadoDia !== undefined) set.programadoDia = cambios.programadoDia;
  if (cambios.programadoHora !== undefined) set.programadoHora = cambios.programadoHora;
  return set;
}

/**
 * Edita el texto, el pendiente y su programación (HU-PDF-01). Como el pendiente ES la nota, editar
 * el texto actualiza la descripción del pendiente y apagar el interruptor lo saca del embudo sin
 * ninguna sincronización (RN3, RN4).
 */
export async function updateNota(
  tenantId: TenantId,
  actorId: string,
  clienteId: string,
  notaId: string,
  cambios: CambiosNota,
): Promise<INotaResponse> {
  const filtro = filtroNota(clienteId, notaId);
  const previa = await findOneScoped(ContactNote, tenantId, filtro).lean<IContactNoteLean>();
  // `null` tanto si no existe como si es de otro tenant u otro contacto: nunca un 403.
  if (!previa) throw new AppError('Nota no encontrada.', 404);

  const set: Record<string, unknown> = { ...cambiosDePendiente(previa, cambios) };
  if (cambios.texto !== undefined) set['textoEnc'] = toStoredValue(cambios.texto);

  const actualizada =
    Object.keys(set).length === 0
      ? previa
      : await findOneAndUpdateScoped(ContactNote, tenantId, filtro, { $set: set }, { new: true })
          .lean<IContactNoteLean>();
  // Borrada entre la lectura y la escritura.
  if (!actualizada) throw new AppError('Nota no encontrada.', 404);

  // Igual que en el alta: se audita qué cambió, jamás el texto.
  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'contact-note.update',
    entidad: 'contact-note',
    entidadId: notaId,
    antes: resumenAuditoria(previa),
    despues: {
      clienteId,
      ...resumenAuditoria(actualizada),
      textoEditado: cambios.texto !== undefined,
    },
  });

  const userMap = await findUsersByIds(tenantId, [String(previa.autorId)]);
  return toNotaResponse(actualizada, userMap);
}

/** Borra la nota y, con ella, su pendiente (RN4). */
export async function deleteNota(
  tenantId: TenantId,
  actorId: string,
  clienteId: string,
  notaId: string,
): Promise<void> {
  const borrada = await findOneAndDeleteScoped(
    ContactNote,
    tenantId,
    filtroNota(clienteId, notaId),
  ).lean<IContactNoteLean>();
  if (!borrada) throw new AppError('Nota no encontrada.', 404);

  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'contact-note.delete',
    entidad: 'contact-note',
    entidadId: notaId,
    antes: { clienteId, ...resumenAuditoria(borrada) },
    despues: {},
  });
}
