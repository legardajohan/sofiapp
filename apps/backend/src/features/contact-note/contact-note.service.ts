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
import { diaEnZona, instanteRecordatorio } from '../pendiente/pendiente.fechas.js';
import { registrarEvento, snapshotProgramacion } from '../organizador/organizador.eventos.js';
import { ContactNote } from './contact-note.model.js';
import type { IContactNote, IContactNoteLean, INotaResponse } from './contact-note.types.js';
import type { UpdateNotaBody } from './contact-note.validation.js';

type TenantId = string | Types.ObjectId;

/** Lo que acepta `updateNota`: el body validado, con `tz` opcional para llamadas internas. */
export type CambiosNota = Omit<UpdateNotaBody, 'tz'> & { tz?: string };

/** Lo que define a un pendiente más allá del texto. `null` en todo cuando la nota no lo es. */
type CamposPendiente = Pick<
  IContactNote,
  | 'pendiente'
  | 'programadoDia'
  | 'programadoHora'
  | 'estadoPendiente'
  | 'cerradoAt'
  | 'cerradoPorId'
  | 'recordatorioAt'
  | 'programadoTz'
  | 'notificadoPara'
  | 'vecesPospuesto'
  | 'avisoAntesMin'
  | 'avisoAt'
>;

const MINUTO_MS = 60_000;

/** Instante del aviso: la hora del pendiente menos la anticipación pedida (HU-PDF-02 A1). */
function instanteAviso(recordatorioAt: Date, antesMin: number): Date {
  return new Date(recordatorioAt.getTime() - antesMin * MINUTO_MS);
}

const SIN_PENDIENTE: CamposPendiente = {
  pendiente: false,
  programadoDia: null,
  programadoHora: null,
  estadoPendiente: null,
  cerradoAt: null,
  cerradoPorId: null,
  recordatorioAt: null,
  programadoTz: null,
  notificadoPara: null,
  vecesPospuesto: 0,
  avisoAntesMin: 0,
  avisoAt: null,
};

/**
 * Un pendiente que nace (alta o encendido del interruptor): abierto, programado y con su
 * recordatorio del Organizador ya calculado (HU-PDF-02). Sin fecha elegida, el día de hoy en la zona
 * de quien escribe (RN10); sin hora, el aviso es a las 08:00 (D1).
 */
function pendienteNuevo(
  dia: string | undefined,
  hora: string | null | undefined,
  tz: string,
  antesMin = 0,
): CamposPendiente {
  const programadoDia = dia ?? diaEnZona(new Date(), tz);
  const programadoHora = hora ?? null;
  const recordatorioAt = instanteRecordatorio(programadoDia, programadoHora, tz);
  return {
    pendiente: true,
    programadoDia,
    programadoHora,
    estadoPendiente: 'abierto',
    cerradoAt: null,
    cerradoPorId: null,
    recordatorioAt,
    programadoTz: tz,
    notificadoPara: null,
    vecesPospuesto: 0,
    avisoAntesMin: antesMin,
    avisoAt: instanteAviso(recordatorioAt, antesMin),
  };
}

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
    avisoAntesMin: pendiente ? (nota.avisoAntesMin ?? 0) : 0,
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
  /** HU-PDF-02 A1 — «Recordarme N minutos antes». */
  avisoAntesMin?: number;
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
    ? pendienteNuevo(
        opciones.programadoDia,
        opciones.programadoHora,
        opciones.tz ?? 'America/Bogota',
        opciones.avisoAntesMin ?? 0,
      )
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

  // HU-PDF-02: el pendiente entra al historial del Organizador desde su alta.
  if (campos.pendiente) {
    await registrarEvento(tenantId, {
      notaId: nota._id,
      clienteId,
      responsableId: autorId,
      tipo: 'programado',
      actorId: autorId,
      origen: 'nota',
      despues: snapshotProgramacion(campos),
    });
  }

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
  const programa =
    cambios.programadoDia !== undefined ||
    cambios.programadoHora !== undefined ||
    cambios.avisoAntesMin !== undefined;

  // RN4 + RN9: quitar el interruptor borra la programación y el cierre.
  if (cambios.pendiente === false) return eraPendiente ? SIN_PENDIENTE : {};

  // Encender el pendiente en una nota que no lo era: nace abierto y programado (RN10).
  if (cambios.pendiente === true && !eraPendiente) {
    return pendienteNuevo(
      cambios.programadoDia,
      cambios.programadoHora,
      cambios.tz ?? 'America/Bogota',
      cambios.avisoAntesMin ?? 0,
    );
  }

  if (!programa) return {};
  // Reprogramar algo que no es pendiente no tiene sentido (CA14).
  if (!eraPendiente) throw new AppError('Activa el pendiente para poder programarlo.', 422);

  const set: Partial<CamposPendiente> = {};
  if (cambios.programadoDia !== undefined) set.programadoDia = cambios.programadoDia;
  if (cambios.programadoHora !== undefined) set.programadoHora = cambios.programadoHora;

  // HU-PDF-02 (CA-12): reprogramar la nota ES reprogramar su recordatorio — mismo documento, nunca
  // uno nuevo. Solo si el instante cambia se rearma el aviso; guardar la misma hora no re-notifica.
  const tz = cambios.tz ?? previa.programadoTz ?? 'America/Bogota';
  const dia = set.programadoDia ?? previa.programadoDia ?? diaEnZona(previa.createdAt, tz);
  const hora = set.programadoHora !== undefined ? set.programadoHora : (previa.programadoHora ?? null);
  const recordatorioAt = instanteRecordatorio(dia, hora, tz);
  const antesMin = cambios.avisoAntesMin ?? previa.avisoAntesMin ?? 0;
  const avisoAt = instanteAviso(recordatorioAt, antesMin);
  if (cambios.avisoAntesMin !== undefined) set.avisoAntesMin = antesMin;
  if (previa.recordatorioAt?.getTime() !== recordatorioAt.getTime()) {
    set.recordatorioAt = recordatorioAt;
    set.programadoTz = tz;
  }
  // Rearma el aviso solo si su instante cambia: guardar lo mismo no re-notifica.
  if (previa.avisoAt?.getTime() !== avisoAt.getTime()) {
    set.avisoAt = avisoAt;
    set.notificadoPara = null;
  }
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

  // HU-PDF-02: programar o reprogramar queda en el historial del pendiente.
  const encendido = !(previa.pendiente ?? false) && (actualizada.pendiente ?? false);
  if (encendido || 'recordatorioAt' in set || 'avisoAt' in set) {
    if (actualizada.pendiente) {
      await registrarEvento(tenantId, {
        notaId,
        clienteId,
        responsableId: previa.autorId,
        tipo: encendido ? 'programado' : 'reprogramado',
        actorId,
        origen: 'nota',
        antes: encendido ? null : snapshotProgramacion(previa),
        despues: snapshotProgramacion(actualizada),
      });
    }
  }

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
