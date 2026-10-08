import { Types, type PipelineStage } from 'mongoose';
import { aggregateScoped, findScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { DIA_MS, inicioDelDiaUtc, normalizeHasta, ratio } from '../../utils/date-range.util.js';
import { Message } from '../message/message.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Lead } from '../lead/lead.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { User } from '../users/user.model.js';
import { KEY_ESTADO_VENTA } from '../estado/estado.types.js';
import {
  ACCIONES_ETAPA_LEAD,
  PREFIJO_CLIENTE_DEMO,
  RANGO_DEFAULT_DIAS,
  RANGO_MAX_DIAS,
  type IAdvisorReportResponse,
  type IAdvisorRow,
} from './reports.types.js';
import type { AdvisorReportQuery } from './reports.validation.js';

/*
 * HU-REP-01 — reporte de TENANT. Todas las lecturas pasan por `aggregateScoped`/`findScoped`, que
 * anteponen `$match { tenantId }` (docs/multi-tenancy.md §3). Los `$lookup` repiten el `tenantId`
 * en su `$expr`: aunque los `_id` sean únicos, el invariante no debe depender de ello.
 */

interface Rango {
  desde: Date;
  hasta: Date;
}

interface Conteo {
  _id: Types.ObjectId | null;
  n: number;
}

/** Rango efectivo: por defecto los últimos 30 días; `hasta` a medianoche = fin de ese día. */
export function resolverRango(q: AdvisorReportQuery, now: Date): Rango {
  const hasta = normalizeHasta(q.hasta ?? inicioDelDiaUtc(now));
  const desde = q.desde ?? new Date(inicioDelDiaUtc(hasta).getTime() - (RANGO_DEFAULT_DIAS - 1) * DIA_MS);
  if (hasta < desde) throw new AppError('`hasta` debe ser igual o posterior a `desde`.', 400);
  if (hasta.getTime() - desde.getTime() > RANGO_MAX_DIAS * DIA_MS) {
    throw new AppError(`El rango no puede superar ${RANGO_MAX_DIAS} días.`, 400);
  }
  return { desde, hasta };
}

function lookupScoped(
  from: string,
  tenantOid: Types.ObjectId,
  localId: string,
  project: Record<string, 1>,
  as: string,
): PipelineStage.Lookup {
  return {
    $lookup: {
      from,
      let: { id: localId },
      pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$_id', '$$id'] }, { $eq: ['$tenantId', tenantOid] }] } } },
        { $project: project },
      ],
      as,
    },
  };
}

function toMap(rows: Conteo[]): Map<string | null, number> {
  const map = new Map<string | null, number>();
  for (const { _id, n } of rows) {
    const key = _id ? String(_id) : null;
    map.set(key, (map.get(key) ?? 0) + n);
  }
  return map;
}

/**
 * Atendidas: hilos con al menos una respuesta HUMANA (`sender: 'agent'`) en el rango, agrupados por
 * su asesor ACTUAL; sin clientes demo. `Message` no guarda autor: una reasignación atribuye al actual.
 */
async function contarAtendidas(tenantOid: Types.ObjectId, r: Rango): Promise<Map<string | null, number>> {
  const rows = await aggregateScoped<Conteo>(Message, tenantOid, [
    { $match: { sender: 'agent', createdAt: { $gte: r.desde, $lte: r.hasta } } },
    { $group: { _id: '$clienteId' } },
    lookupScoped(Cliente.collection.name, tenantOid, '$_id', { asesorId: 1, metaUserId: 1 }, 'c'),
    { $unwind: '$c' },
    { $match: { 'c.metaUserId': { $not: PREFIJO_CLIENTE_DEMO } } },
    { $group: { _id: { $ifNull: ['$c.asesorId', null] }, n: { $sum: 1 } } },
  ]);
  return toMap(rows);
}

/** Asignadas activas: hilos con asesor y movimiento (`ultimoMensajeAt`) en el rango; sin demo. */
async function contarAsignadasActivas(tenantOid: Types.ObjectId, r: Rango): Promise<Map<string | null, number>> {
  const rows = await aggregateScoped<Conteo>(Cliente, tenantOid, [
    {
      $match: {
        asesorId: { $ne: null },
        ultimoMensajeAt: { $gte: r.desde, $lte: r.hasta },
        metaUserId: { $not: PREFIJO_CLIENTE_DEMO },
      },
    },
    { $group: { _id: '$asesorId', n: { $sum: 1 } } },
  ]);
  return toMap(rows);
}

/**
 * Ventas: leads que pasaron a `pagado` dentro del rango (fecha del evento de etapa) y HOY siguen en
 * `pagado`, una vez por lead, atribuidos a su `responsableId`.
 */
async function contarVentas(tenantOid: Types.ObjectId, r: Rango): Promise<Map<string | null, number>> {
  const rows = await aggregateScoped<Conteo>(AuditEvent, tenantOid, [
    {
      $match: {
        accion: { $in: [...ACCIONES_ETAPA_LEAD] },
        entidad: 'lead',
        'despues.estado': KEY_ESTADO_VENTA,
        createdAt: { $gte: r.desde, $lte: r.hasta },
      },
    },
    { $group: { _id: '$entidadId' } },
    lookupScoped(Lead.collection.name, tenantOid, '$_id', { estado: 1, responsableId: 1 }, 'l'),
    { $unwind: '$l' },
    { $match: { 'l.estado': KEY_ESTADO_VENTA } },
    { $group: { _id: { $ifNull: ['$l.responsableId', null] }, n: { $sum: 1 } } },
  ]);
  return toMap(rows);
}

function compararFilas(a: IAdvisorRow, b: IAdvisorRow): number {
  return b.conversacionesAtendidas - a.conversacionesAtendidas || a.nombre.localeCompare(b.nombre, 'es');
}

export async function getAdvisorReport(
  tenantId: string,
  q: AdvisorReportQuery,
  now: Date = new Date(),
): Promise<IAdvisorReportResponse> {
  const rango = resolverRango(q, now);
  const tenantOid = new Types.ObjectId(tenantId);

  const [atendidas, asignadas, ventas, usuarios] = await Promise.all([
    contarAtendidas(tenantOid, rango),
    contarAsignadasActivas(tenantOid, rango),
    contarVentas(tenantOid, rango),
    findScoped(User, tenantOid, {})
      .select({ nombre: 1, activo: 1 })
      .lean<Array<{ _id: Types.ObjectId; nombre: string; activo?: boolean }>>(),
  ]);

  const usados = new Set<string>();
  const porAsesor: IAdvisorRow[] = [];
  for (const u of usuarios) {
    const id = String(u._id);
    const fila = {
      conversacionesAtendidas: atendidas.get(id) ?? 0,
      asignadasActivas: asignadas.get(id) ?? 0,
      ventas: ventas.get(id) ?? 0,
    };
    const activo = u.activo !== false;
    const tieneCifras = fila.conversacionesAtendidas + fila.asignadasActivas + fila.ventas > 0;
    usados.add(id);
    // Un inactivo sin cifras en el periodo no aporta nada y ensuciaría la gráfica.
    if (!activo && !tieneCifras) continue;
    porAsesor.push({
      asesorId: id,
      nombre: u.nombre,
      activo,
      ...fila,
      tasaCierre: ratio(fila.ventas, fila.conversacionesAtendidas),
    });
  }
  porAsesor.sort(compararFilas);

  // Lo que no es de ningún usuario del tenant (nulo o usuario borrado) va a "sin asignar", para
  // que los totales cuadren con los datos operativos (DoD).
  const huerfanos = (m: Map<string | null, number>): number =>
    [...m.entries()].reduce((s, [k, n]) => (k !== null && usados.has(k) ? s : s + n), 0);
  const sinAsignar = { conversacionesAtendidas: huerfanos(atendidas), ventas: huerfanos(ventas) };

  const suma = (k: 'conversacionesAtendidas' | 'asignadasActivas' | 'ventas'): number =>
    porAsesor.reduce((s, f) => s + f[k], 0);
  const totalAtendidas = suma('conversacionesAtendidas') + sinAsignar.conversacionesAtendidas;
  const totalVentas = suma('ventas') + sinAsignar.ventas;

  return {
    generadoAt: now.toISOString(),
    rango: { desde: rango.desde.toISOString(), hasta: rango.hasta.toISOString() },
    totales: {
      asesores: porAsesor.length,
      conversacionesAtendidas: totalAtendidas,
      asignadasActivas: suma('asignadasActivas'),
      ventas: totalVentas,
      tasaCierre: ratio(totalVentas, totalAtendidas),
    },
    porAsesor,
    sinAsignar,
  };
}
