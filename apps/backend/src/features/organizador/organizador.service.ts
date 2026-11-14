import { Types } from 'mongoose';
import type { FilterQuery } from 'mongoose';
import {
  countScoped,
  createScoped,
  findOneAndUpdateScoped,
  findOneScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { publishRealtime } from '../../realtime/realtime.publisher.js';
import { AppError } from '../../utils/AppError.js';
import { fromStoredValue } from '../../utils/field-crypto.util.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { Cliente } from '../cliente/cliente.model.js';
import { ContactNote } from '../contact-note/contact-note.model.js';
import type { IContactNoteDocument, IContactNoteLean } from '../contact-note/contact-note.types.js';
import { addTagsToCliente } from '../conversation/conversation.service.js';
import type { IPaginated } from '../conversation/conversation.types.js';
import { diaEnZona, instanteEnZona } from '../pendiente/pendiente.fechas.js';
import { assertTagsDelTenant, findTagsByIds } from '../tag/tag.service.js';
import { findUsersByIds } from '../users/user.service.js';
import { derivarEstado, filtroAvisoDisparado, filtroPorEstado } from './organizador.estado.js';
import { registrarEvento, snapshotProgramacion } from './organizador.eventos.js';
import { MotivoCierre, OrganizadorPreferencia, PendienteEvento } from './organizador.model.js';
import {
  ACTIVOS_MAXIMO,
  ESTADOS_ORGANIZADOR,
  MOTIVOS_PREDEFINIDOS,
} from './organizador.types.js';
import type {
  EstadoOrganizador,
  IActivosResponse,
  IClienteRef,
  IMotivoCierreLean,
  IMotivoCierreResponse,
  IMotivoSnapshot,
  IMotivosCierreResponse,
  IOrganizadorPendienteResponse,
  IPendienteEventoDocument,
  IPendienteEventoLean,
  IPendienteEventoResponse,
  IPreferenciaResponse,
  IProgramacionSnapshot,
  IUsuarioRef,
  MotivoKey,
} from './organizador.types.js';
import type {
  ActividadQuery,
  CerrarBody,
  ConteosQuery,
  ListOrganizadorQuery,
  PosponerBody,
} from './organizador.validation.js';

type TenantId = string | Types.ObjectId;

interface IClienteHidratacion {
  _id: Types.ObjectId;
  nombre?: string;
  telefono: string;
}

const ORDEN_AGENDA = { recordatorioAt: 1, _id: 1 } as const;
const ORDEN_CERRADOS = { cerradoAt: -1, _id: -1 } as const;

function oid(id: string | Types.ObjectId): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

function usuarioRef(usuarios: Map<string, { nombre: string | null }>, id: Types.ObjectId): IUsuarioRef {
  const clave = String(id);
  return { id: clave, nombre: usuarios.get(clave)?.nombre ?? null };
}

async function clientesPorId(
  tenantId: TenantId,
  ids: Types.ObjectId[],
): Promise<Map<string, IClienteRef>> {
  const unicos = [...new Set(ids.map(String))].map((id) => new Types.ObjectId(id));
  if (unicos.length === 0) return new Map();
  const clientes = await findScoped(Cliente, tenantId, { _id: { $in: unicos } })
    .select({ nombre: 1, telefono: 1 })
    .lean<IClienteHidratacion[]>();
  return new Map(
    clientes.map((c) => [String(c._id), { nombre: c.nombre ?? null, telefono: c.telefono }]),
  );
}

/** Compone las notas con contacto y usuarios **en lote**: una consulta por colección. */
async function hidratarPendientes(
  tenantId: TenantId,
  notas: IContactNoteLean[],
  now: Date,
): Promise<IOrganizadorPendienteResponse[]> {
  if (notas.length === 0) return [];
  const usuarioIds = notas.flatMap((n) =>
    n.cerradoPorId ? [String(n.autorId), String(n.cerradoPorId)] : [String(n.autorId)],
  );
  const [clientes, usuarios] = await Promise.all([
    clientesPorId(tenantId, notas.map((n) => n.clienteId)),
    findUsersByIds(tenantId, usuarioIds),
  ]);

  return notas.map((nota) => {
    const clienteId = String(nota.clienteId);
    return {
      id: String(nota._id),
      clienteId,
      cliente: clientes.get(clienteId) ?? { nombre: null, telefono: '' },
      descripcion: fromStoredValue(nota.textoEnc),
      programadoDia: nota.programadoDia ?? diaEnZona(nota.createdAt, 'America/Bogota'),
      programadoHora: nota.programadoHora ?? null,
      recordatorioAt: nota.recordatorioAt ? nota.recordatorioAt.toISOString() : null,
      avisoAt: (nota.avisoAt ?? nota.recordatorioAt)?.toISOString() ?? null,
      avisoAntesMin: nota.avisoAntesMin ?? 0,
      estado: derivarEstado(nota, now),
      vecesPospuesto: nota.vecesPospuesto ?? 0,
      responsable: usuarioRef(usuarios, nota.autorId),
      cerradoAt: nota.cerradoAt ? nota.cerradoAt.toISOString() : null,
      cerradoPor: nota.cerradoPorId ? usuarioRef(usuarios, nota.cerradoPorId) : null,
      version: nota.recordatorioAt ? nota.recordatorioAt.toISOString() : null,
    };
  });
}

function programacionResponse(
  p: IProgramacionSnapshot | null,
): IPendienteEventoResponse['antes'] {
  if (!p) return null;
  return {
    dia: p.dia ?? null,
    hora: p.hora ?? null,
    recordatorioAt: p.recordatorioAt ? p.recordatorioAt.toISOString() : null,
  };
}

async function hidratarEventos(
  tenantId: TenantId,
  eventos: IPendienteEventoLean[],
): Promise<IPendienteEventoResponse[]> {
  if (eventos.length === 0) return [];
  const usuarioIds = eventos.flatMap((e) =>
    e.actorId ? [String(e.actorId), String(e.responsableId)] : [String(e.responsableId)],
  );
  const tagIds = eventos.flatMap((e) => e.tagIds.map(String));
  const [clientes, usuarios, tags] = await Promise.all([
    clientesPorId(tenantId, eventos.map((e) => e.clienteId)),
    findUsersByIds(tenantId, usuarioIds),
    findTagsByIds(tenantId, tagIds),
  ]);

  return eventos.map((e) => ({
    id: String(e._id),
    notaId: String(e.notaId),
    clienteId: String(e.clienteId),
    cliente: clientes.get(String(e.clienteId)) ?? null,
    tipo: e.tipo,
    actor: e.actorId ? usuarioRef(usuarios, e.actorId) : null,
    responsable: usuarioRef(usuarios, e.responsableId),
    at: e.at.toISOString(),
    antes: programacionResponse(e.antes),
    despues: programacionResponse(e.despues),
    motivo: e.motivo,
    motivos: e.motivos.map((m) => ({
      key: m.key,
      motivoId: m.motivoId ? String(m.motivoId) : null,
      nombre: m.nombre,
    })),
    otroMotivo: e.otroMotivo,
    comentario: e.comentario,
    // Una etiqueta borrada después del evento ya no se puede pintar: se omite.
    tags: e.tagIds.flatMap((id) => {
      const tag = tags.get(String(id));
      return tag ? [{ id: tag.id, nombre: tag.nombre, color: tag.color }] : [];
    }),
    origen: e.origen,
  }));
}

// ── Preferencia ─────────────────────────────────────────────────────────────

export async function getPreferencia(
  tenantId: TenantId,
  userId: string,
): Promise<IPreferenciaResponse> {
  const pref = await findOneScoped(OrganizadorPreferencia, tenantId, { userId: oid(userId) })
    .select({ activo: 1 })
    .lean<{ activo?: boolean } | null>();
  // Sin documento: activado. El organizador está pensado para estar encendido.
  return { activo: pref?.activo ?? true };
}

export async function setPreferencia(
  tenantId: TenantId,
  userId: string,
  activo: boolean,
): Promise<IPreferenciaResponse> {
  const pref = await findOneAndUpdateScoped(
    OrganizadorPreferencia,
    tenantId,
    { userId: oid(userId) },
    { $set: { activo } },
    { upsert: true, new: true },
  ).lean<{ activo: boolean } | null>();
  return { activo: pref?.activo ?? activo };
}

// ── Lectura ─────────────────────────────────────────────────────────────────

/** Filtros comunes de listado y contadores: rango por día programado, cliente y responsable. */
function filtrosComunes(q: ConteosQuery): FilterQuery<IContactNoteDocument> {
  const filtro: FilterQuery<IContactNoteDocument> = {};
  if (q.desde || q.hasta) {
    // `YYYY-MM-DD` ordena como las fechas que representa: comparación de cadenas, sin husos.
    filtro.programadoDia = {
      ...(q.desde ? { $gte: q.desde } : {}),
      ...(q.hasta ? { $lte: q.hasta } : {}),
    };
  }
  if (q.clienteId) filtro.clienteId = oid(q.clienteId);
  if (q.responsableId) filtro.autorId = oid(q.responsableId);
  return filtro;
}

export async function listOrganizador(
  tenantId: TenantId,
  q: ListOrganizadorQuery,
  now: Date = new Date(),
): Promise<IPaginated<IOrganizadorPendienteResponse>> {
  const filtro: FilterQuery<IContactNoteDocument> = {
    ...filtrosComunes(q),
    ...(q.estado
      ? filtroPorEstado(q.estado, now)
      : { pendiente: true, estadoPendiente: { $in: ['abierto', 'cerrado'] } }),
  };
  const [notas, total] = await Promise.all([
    findScoped(ContactNote, tenantId, filtro)
      .sort(q.estado === 'cerrado' ? ORDEN_CERRADOS : ORDEN_AGENDA)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean<IContactNoteLean[]>(),
    countScoped(ContactNote, tenantId, filtro),
  ]);
  return { data: await hidratarPendientes(tenantId, notas, now), page: q.page, limit: q.limit, total };
}

export async function conteosOrganizador(
  tenantId: TenantId,
  q: ConteosQuery,
  now: Date = new Date(),
): Promise<Record<EstadoOrganizador, number>> {
  const comunes = filtrosComunes(q);
  const totales = await Promise.all(
    ESTADOS_ORGANIZADOR.map((estado) =>
      countScoped(ContactNote, tenantId, { ...comunes, ...filtroPorEstado(estado, now) }),
    ),
  );
  return Object.fromEntries(
    ESTADOS_ORGANIZADOR.map((estado, i) => [estado, totales[i] ?? 0]),
  ) as Record<EstadoOrganizador, number>;
}

/**
 * Recordatorios vencidos sin gestionar **del usuario** (D2: el aviso es del autor de la nota). Es
 * la fuente de verdad de la pila y de la campana: el socket solo avisa de que hay que preguntar,
 * así que un navegador cerrado o un evento perdido no hacen desaparecer nada (CA-04).
 */
export async function listActivos(
  tenantId: TenantId,
  userId: string,
  now: Date = new Date(),
): Promise<IActivosResponse> {
  // HU-PDF-02 A1: «activo» = su aviso ya se disparó, aunque con anticipación aún no esté vencido.
  const filtro = { ...filtroAvisoDisparado(now), autorId: oid(userId) };
  const [notas, total] = await Promise.all([
    findScoped(ContactNote, tenantId, filtro)
      .sort(ORDEN_AGENDA)
      .limit(ACTIVOS_MAXIMO)
      .lean<IContactNoteLean[]>(),
    countScoped(ContactNote, tenantId, filtro),
  ]);
  return { items: await hidratarPendientes(tenantId, notas, now), total };
}

export async function historialPendiente(
  tenantId: TenantId,
  notaId: string,
): Promise<IPendienteEventoResponse[]> {
  const _id = oid(notaId);
  const eventos = await findScoped(PendienteEvento, tenantId, { notaId: _id })
    .sort({ at: 1, _id: 1 })
    .lean<IPendienteEventoLean[]>();
  if (eventos.length === 0) {
    const existe = await findOneScoped(ContactNote, tenantId, { _id, pendiente: true })
      .select({ _id: 1 })
      .lean();
    if (!existe) throw new AppError('Pendiente no encontrado.', 404);
  }
  return hidratarEventos(tenantId, eventos);
}

export async function listActividad(
  tenantId: TenantId,
  q: ActividadQuery,
): Promise<IPaginated<IPendienteEventoResponse>> {
  const filtro: FilterQuery<IPendienteEventoDocument> = {};
  if (q.clienteId) filtro.clienteId = oid(q.clienteId);
  if (q.responsableId) filtro.responsableId = oid(q.responsableId);
  const [eventos, total] = await Promise.all([
    findScoped(PendienteEvento, tenantId, filtro)
      .sort({ at: -1, _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean<IPendienteEventoLean[]>(),
    countScoped(PendienteEvento, tenantId, filtro),
  ]);
  return { data: await hidratarEventos(tenantId, eventos), page: q.page, limit: q.limit, total };
}

// ── Transiciones ────────────────────────────────────────────────────────────

/**
 * Filtro de la escritura de cerrar/posponer. Lleva el estado de origen **y** la versión
 * (`recordatorioAt` que vio el cliente): dos pestañas, un doble clic o una reprogramación en medio
 * nunca producen dos transiciones (CA-14).
 */
function filtroTransicion(notaId: string, version: string | null): FilterQuery<IContactNoteDocument> {
  return {
    _id: oid(notaId),
    pendiente: true,
    estadoPendiente: 'abierto',
    recordatorioAt: version ? new Date(version) : null,
  };
}

/** Si la escritura condicional no casó: ¿no existe en el tenant (404) o ya se gestionó (409)? */
async function errorDeTransicion(tenantId: TenantId, notaId: string): Promise<never> {
  const existe = await findOneScoped(ContactNote, tenantId, { _id: oid(notaId), pendiente: true })
    .select({ _id: 1 })
    .lean();
  if (!existe) throw new AppError('Pendiente no encontrado.', 404);
  throw new AppError('Este pendiente ya fue gestionado.', 409);
}

/** Valida que los motivos personalizados existan en el tenant y devuelve su snapshot. */
async function resolverMotivos(
  tenantId: TenantId,
  keys: MotivoKey[],
  ids: string[],
): Promise<IMotivoSnapshot[]> {
  const predefinidos: IMotivoSnapshot[] = [...new Set(keys)].map((key) => ({
    key,
    motivoId: null,
    nombre: MOTIVOS_PREDEFINIDOS.find((m) => m.key === key)?.nombre ?? key,
  }));
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return predefinidos;
  const motivos = await findScoped(MotivoCierre, tenantId, { _id: { $in: unicos.map(oid) } })
    .select({ nombre: 1 })
    .lean<IMotivoCierreLean[]>();
  if (motivos.length !== unicos.length) {
    throw new AppError('Alguno de los motivos no existe en esta empresa.', 404);
  }
  return [
    ...predefinidos,
    ...motivos.map((m) => ({ key: null, motivoId: m._id, nombre: m.nombre })),
  ];
}

function avisarCambio(tenantId: TenantId, notaId: string): Promise<void> {
  return publishRealtime({ type: 'pendiente:updated', tenantId: String(tenantId), notaId });
}

/** CERRAR PENDIENTE (HU-PDF-02 §5): motivo obligatorio, etiquetas opcionales, historial. */
export async function cerrarConMotivo(
  tenantId: TenantId,
  actorId: string,
  notaId: string,
  body: CerrarBody,
  now: Date = new Date(),
): Promise<IOrganizadorPendienteResponse> {
  // Todo lo que puede fallar se valida ANTES de cerrar: un cierre a medias no se puede deshacer.
  const motivos = await resolverMotivos(tenantId, body.motivoKeys, body.motivoIds);
  const tagIds = [...new Set(body.tagIds)];
  await assertTagsDelTenant(tenantId, tagIds);

  const nota = await findOneAndUpdateScoped(
    ContactNote,
    tenantId,
    filtroTransicion(notaId, body.version),
    { $set: { estadoPendiente: 'cerrado', cerradoAt: now, cerradoPorId: oid(actorId) } },
    { new: true },
  ).lean<IContactNoteLean | null>();
  if (!nota) return errorDeTransicion(tenantId, notaId);

  await registrarEvento(tenantId, {
    notaId: nota._id,
    clienteId: nota.clienteId,
    responsableId: nota.autorId,
    tipo: 'cerrado',
    actorId,
    origen: 'organizador',
    at: now,
    antes: snapshotProgramacion(nota),
    motivos,
    otroMotivo: body.otro?.texto ?? null,
    comentario: body.comentario || null,
    tagIds,
  });
  await addTagsToCliente(String(tenantId), String(nota.clienteId), tagIds);
  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'contact-note.pendiente-cerrar',
    entidad: 'contact-note',
    entidadId: notaId,
    antes: { estadoPendiente: 'abierto' },
    despues: {
      clienteId: String(nota.clienteId),
      estadoPendiente: 'cerrado',
      motivos: motivos.map((m) => m.nombre),
      otroMotivo: body.otro !== undefined,
      tagIds,
    },
  });
  await avisarCambio(tenantId, notaId);

  const [respuesta] = await hidratarPendientes(tenantId, [nota], now);
  return respuesta!;
}

/** POSPONER PENDIENTE (HU-PDF-02 §6): justificación, nueva fecha y hora futuras, historial. */
export async function posponer(
  tenantId: TenantId,
  actorId: string,
  notaId: string,
  body: PosponerBody,
  now: Date = new Date(),
): Promise<IOrganizadorPendienteResponse> {
  const nuevo = instanteEnZona(body.nuevoDia, body.nuevaHora, body.tz);
  if (nuevo.getTime() <= now.getTime()) {
    throw new AppError('La nueva fecha y hora deben ser posteriores a la actual.', 400);
  }
  const tagIds = [...new Set(body.tagIds)];
  await assertTagsDelTenant(tenantId, tagIds);

  // `new: false`: el documento previo es el «antes» del historial.
  const previa = await findOneAndUpdateScoped(
    ContactNote,
    tenantId,
    filtroTransicion(notaId, body.version),
    {
      $set: {
        programadoDia: body.nuevoDia,
        programadoHora: body.nuevaHora,
        programadoTz: body.tz,
        recordatorioAt: nuevo,
        notificadoPara: null,
        avisoAt: null, // se fija abajo con la anticipación de la nota
      },
      $inc: { vecesPospuesto: 1 },
    },
    { new: false },
  ).lean<IContactNoteLean | null>();
  if (!previa) return errorDeTransicion(tenantId, notaId);

  // La anticipación pedida en la nota se conserva al posponer (HU-PDF-02 A1).
  const avisoAt = new Date(nuevo.getTime() - (previa.avisoAntesMin ?? 0) * 60_000);
  await findOneAndUpdateScoped(
    ContactNote,
    tenantId,
    { _id: previa._id, recordatorioAt: nuevo },
    { $set: { avisoAt } },
  ).lean();

  const actualizada: IContactNoteLean = {
    ...previa,
    programadoDia: body.nuevoDia,
    programadoHora: body.nuevaHora,
    programadoTz: body.tz,
    recordatorioAt: nuevo,
    notificadoPara: null,
    avisoAt,
    vecesPospuesto: (previa.vecesPospuesto ?? 0) + 1,
  };

  await registrarEvento(tenantId, {
    notaId: previa._id,
    clienteId: previa.clienteId,
    responsableId: previa.autorId,
    tipo: 'pospuesto',
    actorId,
    origen: 'organizador',
    at: now,
    antes: snapshotProgramacion(previa),
    despues: snapshotProgramacion(actualizada),
    motivo: body.motivo,
    tagIds,
  });
  await addTagsToCliente(String(tenantId), String(previa.clienteId), tagIds);
  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'contact-note.pendiente-posponer',
    entidad: 'contact-note',
    entidadId: notaId,
    antes: { programadoDia: previa.programadoDia ?? null, programadoHora: previa.programadoHora ?? null },
    despues: {
      clienteId: String(previa.clienteId),
      programadoDia: body.nuevoDia,
      programadoHora: body.nuevaHora,
      tagIds,
    },
  });
  await avisarCambio(tenantId, notaId);

  const [respuesta] = await hidratarPendientes(tenantId, [actualizada], now);
  return respuesta!;
}

// ── Motivos de cierre ───────────────────────────────────────────────────────

export async function listMotivos(tenantId: TenantId): Promise<IMotivosCierreResponse> {
  const personalizados = await findScoped(MotivoCierre, tenantId)
    .sort({ nombre: 1 })
    .collation({ locale: 'es', strength: 2 })
    .lean<IMotivoCierreLean[]>();
  return {
    predefinidos: MOTIVOS_PREDEFINIDOS.map((m) => ({ key: m.key, nombre: m.nombre })),
    personalizados: personalizados.map((m) => ({ id: String(m._id), nombre: m.nombre })),
  };
}

export async function crearMotivo(
  tenantId: TenantId,
  actorId: string,
  nombre: string,
): Promise<IMotivoCierreResponse> {
  const repetidoPredefinido = MOTIVOS_PREDEFINIDOS.some(
    (m) => m.nombre.localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0,
  );
  if (repetidoPredefinido) throw new AppError('Ese motivo ya existe.', 409);
  try {
    const creado = await createScoped(MotivoCierre, tenantId, { nombre, creadoPorId: oid(actorId) });
    return { id: String(creado._id), nombre: creado.nombre };
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000) {
      throw new AppError('Ese motivo ya existe.', 409);
    }
    throw err;
  }
}
