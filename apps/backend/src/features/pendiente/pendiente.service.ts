import { Types } from 'mongoose';
import type { FilterQuery } from 'mongoose';
import {
  countScoped,
  findOneAndUpdateScoped,
  findOneScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { fromStoredOptional, fromStoredValue } from '../../utils/field-crypto.util.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { CanalOrigen } from '../cliente/cliente.types.js';
import { ContactNote } from '../contact-note/contact-note.model.js';
import type {
  EstadoPendiente,
  IContactNoteDocument,
  IContactNoteLean,
} from '../contact-note/contact-note.types.js';
import type { IPaginated } from '../conversation/conversation.types.js';
import { listEstados } from '../estado/estado.service.js';
import { Lead } from '../lead/lead.model.js';
import { getNombreEmpresa } from '../tenant/tenant.service.js';
import { findUsersByIds } from '../users/user.service.js';
import { diaEnZona, nombreArchivoPendientes } from './pendiente.fechas.js';
import { renderReportePendientes } from './pendiente.pdf.js';
import { registrarEvento, snapshotProgramacion } from '../organizador/organizador.eventos.js';
import { publishRealtime } from '../../realtime/realtime.publisher.js';
import { PENDIENTES_PDF_MAX } from './pendiente.types.js';
import type { IEtapaPendienteResponse, IPendienteResponse } from './pendiente.types.js';
import type { PdfPendientesQuery } from './pendiente.validation.js';

type TenantId = string | Types.ObjectId;

/** Color de una etapa cuya `key` ya no está en el catálogo: neutro, para no inventar significado. */
const COLOR_ETAPA_DESCONOCIDA = '#94a3b8';

/** Lo único que la hidratación necesita del contacto. */
interface IClientePendiente {
  _id: Types.ObjectId;
  nombre?: string;
  telefono: string;
  canalOrigen: CanalOrigen;
  correoEnc?: string;
}

/** Lo único que la hidratación necesita del lead. */
interface ILeadPendiente {
  _id: Types.ObjectId;
  clienteId: Types.ObjectId;
  nombre: string;
  telefono: string;
  correo?: string;
  estado: string;
}

/**
 * Orden de agenda (RN11): día programado, luego hora —`null` («todo el día») ordena antes que
 * cualquier hora en Mongo—, luego creación; `_id` deja los empates estables entre páginas.
 */
const ORDEN_AGENDA = { programadoDia: 1, programadoHora: 1, createdAt: 1, _id: 1 } as const;
/** Historial: el más recién cerrado primero. */
const ORDEN_HISTORIAL = { cerradoAt: -1, _id: -1 } as const;

function filtroEstado(estado: EstadoPendiente): FilterQuery<IContactNoteDocument> {
  return { pendiente: true, estadoPendiente: estado };
}

/**
 * Compone las notas con contacto, lead, etapa y usuarios **en lote**: una consulta por colección
 * para toda la página, nunca una por nota (mismo criterio que `hidratarLeadsParaListado`).
 *
 * Si el contacto tiene lead, la tarjeta muestra los datos del lead —que es lo que el asesor ve en el
 * embudo— y su etapa. Si no, los del contacto y `etapa: null` («Sin convertir»).
 */
async function hidratarPendientes(
  tenantId: TenantId,
  notas: IContactNoteLean[],
): Promise<IPendienteResponse[]> {
  if (notas.length === 0) return [];

  const clienteIds = [...new Set(notas.map((n) => String(n.clienteId)))].map(
    (id) => new Types.ObjectId(id),
  );
  const usuarioIds = notas.flatMap((n) =>
    n.cerradoPorId ? [String(n.autorId), String(n.cerradoPorId)] : [String(n.autorId)],
  );

  const [clientes, leads, estados, usuarios] = await Promise.all([
    findScoped(Cliente, tenantId, { _id: { $in: clienteIds } })
      .select({ nombre: 1, telefono: 1, canalOrigen: 1, correoEnc: 1 })
      .lean<IClientePendiente[]>(),
    findScoped(Lead, tenantId, { clienteId: { $in: clienteIds } })
      .select({ clienteId: 1, nombre: 1, telefono: 1, correo: 1, estado: 1 })
      .lean<ILeadPendiente[]>(),
    // Todas, no solo las activas: un lead puede seguir en una etapa ya archivada.
    listEstados(tenantId),
    findUsersByIds(tenantId, usuarioIds),
  ]);

  const clientePorId = new Map(clientes.map((c) => [String(c._id), c]));
  const leadPorCliente = new Map(leads.map((l) => [String(l.clienteId), l]));
  const etapaPorKey = new Map(estados.map((e) => [e.key, e]));

  function etapaDe(key: string): IEtapaPendienteResponse {
    const etapa = etapaPorKey.get(key);
    return etapa
      ? { key, label: etapa.label, color: etapa.color }
      : { key, label: key, color: COLOR_ETAPA_DESCONOCIDA };
  }

  function usuario(id: Types.ObjectId): { id: string; nombre: string | null } {
    const clave = String(id);
    return { id: clave, nombre: usuarios.get(clave)?.nombre ?? null };
  }

  return notas.map((nota): IPendienteResponse => {
    const clienteId = String(nota.clienteId);
    const cliente = clientePorId.get(clienteId);
    const lead = leadPorCliente.get(clienteId);

    return {
      id: String(nota._id),
      clienteId,
      descripcion: fromStoredValue(nota.textoEnc),
      autor: usuario(nota.autorId),
      createdAt: nota.createdAt.toISOString(),
      // Un pendiente sin día (dato anterior a A1) se lee como del día en que se creó (RN10).
      programadoDia: nota.programadoDia ?? diaEnZona(nota.createdAt, 'America/Bogota'),
      programadoHora: nota.programadoHora ?? null,
      estado: nota.estadoPendiente ?? 'abierto',
      cerradoAt: nota.cerradoAt ? nota.cerradoAt.toISOString() : null,
      cerradoPor: nota.cerradoPorId ? usuario(nota.cerradoPorId) : null,
      recordatorioAt: nota.recordatorioAt ? nota.recordatorioAt.toISOString() : null,
      lead: {
        leadId: lead ? String(lead._id) : null,
        nombre: lead?.nombre ?? cliente?.nombre ?? null,
        telefono: lead?.telefono ?? cliente?.telefono ?? '',
        correo: lead?.correo ?? fromStoredOptional(cliente?.correoEnc) ?? null,
        canalOrigen: cliente?.canalOrigen ?? null,
        etapa: lead ? etapaDe(lead.estado) : null,
      },
    };
  });
}

/**
 * La columna «Pendientes» del embudo: abiertos en orden de agenda, o el historial de cerrados
 * (HU-PDF-01 A1).
 */
export async function listPendientes(
  tenantId: TenantId,
  estado: EstadoPendiente,
  page: number,
  limit: number,
): Promise<IPaginated<IPendienteResponse>> {
  const filtro = filtroEstado(estado);
  const [notas, total] = await Promise.all([
    findScoped(ContactNote, tenantId, filtro)
      .sort(estado === 'abierto' ? ORDEN_AGENDA : ORDEN_HISTORIAL)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<IContactNoteLean[]>(),
    countScoped(ContactNote, tenantId, filtro),
  ]);

  return { data: await hidratarPendientes(tenantId, notas), page, limit, total };
}

/**
 * Cambia el estado de un pendiente (RN12). La condición sobre el estado de origen va **en el
 * filtro de la escritura**, no en una lectura previa: dos clics simultáneos en «Cerrar» no pueden
 * cerrar dos veces. Si la escritura no casa, una segunda lectura distingue «no existe» (404) de
 * «ya estaba en ese estado» (409).
 */
async function transicionar(
  tenantId: TenantId,
  actorId: string,
  notaId: string,
  de: EstadoPendiente,
  a: EstadoPendiente,
): Promise<IPendienteResponse> {
  const _id = new Types.ObjectId(notaId);
  const set =
    a === 'cerrado'
      ? { estadoPendiente: a, cerradoAt: new Date(), cerradoPorId: new Types.ObjectId(actorId) }
      : // Reabrir rearma el aviso (HU-PDF-02): si ya venció, vuelve a notificar — es una acción
        // explícita del usuario, no una re-notificación del mismo cierre.
        { estadoPendiente: a, cerradoAt: null, cerradoPorId: null, notificadoPara: null };

  const nota = await findOneAndUpdateScoped(
    ContactNote,
    tenantId,
    { _id, pendiente: true, estadoPendiente: de },
    { $set: set },
    { new: true },
  ).lean<IContactNoteLean>();

  if (!nota) {
    const existe = await findOneScoped(ContactNote, tenantId, { _id, pendiente: true })
      .select({ _id: 1 })
      .lean();
    if (!existe) throw new AppError('Pendiente no encontrado.', 404);
    throw new AppError(
      a === 'cerrado' ? 'Este pendiente ya está cerrado.' : 'Este pendiente ya está abierto.',
      409,
    );
  }

  await recordAuditEvent(tenantId, {
    actorId,
    accion: a === 'cerrado' ? 'contact-note.pendiente-cerrar' : 'contact-note.pendiente-reabrir',
    entidad: 'contact-note',
    entidadId: notaId,
    antes: { estadoPendiente: de },
    despues: { clienteId: String(nota.clienteId), estadoPendiente: a },
  });

  // HU-PDF-02: el cierre rápido y la reapertura también quedan en el historial del Organizador.
  await registrarEvento(tenantId, {
    notaId: nota._id,
    clienteId: nota.clienteId,
    responsableId: nota.autorId,
    tipo: a === 'cerrado' ? 'cerrado' : 'reabierto',
    actorId,
    origen: 'rapido',
    antes: snapshotProgramacion(nota),
  });
  await publishRealtime({ type: 'pendiente:updated', tenantId: String(tenantId), notaId });

  const [pendiente] = await hidratarPendientes(tenantId, [nota]);
  return pendiente!;
}

/** Marca el pendiente como cumplido y lo archiva en el historial (CA16). */
export function cerrarPendiente(
  tenantId: TenantId,
  actorId: string,
  notaId: string,
): Promise<IPendienteResponse> {
  return transicionar(tenantId, actorId, notaId, 'abierto', 'cerrado');
}

/** Lo devuelve a la columna con su programación intacta (CA17). */
export function reabrirPendiente(
  tenantId: TenantId,
  actorId: string,
  notaId: string,
): Promise<IPendienteResponse> {
  return transicionar(tenantId, actorId, notaId, 'cerrado', 'abierto');
}

/**
 * El «Reporte de pendientes» en PDF (HU-PDF-01). Filtra por **día programado** y trae abiertos y
 * cerrados (RN14). Los errores esperables —rango vacío, rango con demasiadas filas— se lanzan
 * **antes** de crear el documento, para que el `errorHandler` pueda seguir respondiendo JSON: una
 * vez empieza el stream ya no se puede cambiar el status.
 */
export async function generarReportePendientes(
  tenantId: string,
  usuarioId: string,
  query: PdfPendientesQuery,
): Promise<{ documento: PDFKit.PDFDocument; filename: string }> {
  // Comparación de cadenas: `YYYY-MM-DD` ordena igual que las fechas que representa.
  const filtro: FilterQuery<IContactNoteDocument> = {
    pendiente: true,
    estadoPendiente: { $in: ['abierto', 'cerrado'] },
    programadoDia: { $gte: query.desde, $lte: query.hasta },
  };

  const total = await countScoped(ContactNote, tenantId, filtro);
  // CA5.
  if (total === 0) throw new AppError('No hay pendientes en el rango seleccionado.', 404);
  if (total > PENDIENTES_PDF_MAX) {
    throw new AppError(
      `El rango tiene ${total} pendientes y el máximo por reporte es ${PENDIENTES_PDF_MAX}. Acórtalo.`,
      422,
    );
  }

  const [notas, empresa, usuarios] = await Promise.all([
    findScoped(ContactNote, tenantId, filtro).sort(ORDEN_AGENDA).lean<IContactNoteLean[]>(),
    // El nombre de la empresa sale del tenant del token, nunca de la query.
    getNombreEmpresa(tenantId),
    findUsersByIds(tenantId, [usuarioId]),
  ]);

  const documento = renderReportePendientes({
    empresa,
    desde: query.desde,
    hasta: query.hasta,
    tz: query.tz,
    generadoAt: new Date(),
    generadoPor: usuarios.get(usuarioId)?.nombre ?? 'Usuario',
    pendientes: await hidratarPendientes(tenantId, notas),
  });

  return { documento, filename: nombreArchivoPendientes(query.desde, query.hasta) };
}
