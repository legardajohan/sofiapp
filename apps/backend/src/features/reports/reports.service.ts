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
import { MOTIVOS_HANDOFF, type HandoffMotivo } from '../ai/ai-handoff.types.js';
import { listarProductosKb } from '../kb/kb-productos.reader.js';
import {
  ACCION_HANDOFF,
  ACCIONES_ETAPA_LEAD,
  PREFIJO_CLIENTE_DEMO,
  RANGO_DEFAULT_DIAS,
  RANGO_MAX_DIAS,
  type IAdvisorReportResponse,
  type IAdvisorRow,
  type IHandoffRateResponse,
  type ITopProductRow,
  type ITopProductsResponse,
} from './reports.types.js';
import type {
  AdvisorReportQuery,
  HandoffRateQuery,
  RangoReporteQuery,
  TopProductsQuery,
} from './reports.validation.js';

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
export function resolverRango(q: RangoReporteQuery, now: Date): Rango {
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

/* ─────────────────────────── HU-REP-02 — Tasa de escalamiento ─────────────────────────── */

interface FilaMotivo {
  _id: string | null;
  conversaciones: number;
  eventos: number;
}

/**
 * Transferidas: conversaciones DISTINTAS con al menos un `conversation.handoff` en el rango, cada una
 * con el motivo de su ÚLTIMO handoff del periodo. Un `entidadId` que no resuelve a un cliente del
 * tenant (borrado o foráneo) no cuenta; los hilos demo tampoco.
 */
async function contarTransferidas(tenantOid: Types.ObjectId, r: Rango): Promise<FilaMotivo[]> {
  return aggregateScoped<FilaMotivo>(AuditEvent, tenantOid, [
    { $match: { accion: ACCION_HANDOFF, entidad: 'cliente', createdAt: { $gte: r.desde, $lte: r.hasta } } },
    { $sort: { createdAt: 1, _id: 1 } },
    { $group: { _id: '$entidadId', eventos: { $sum: 1 }, motivo: { $last: '$despues.motivo' } } },
    lookupScoped(Cliente.collection.name, tenantOid, '$_id', { metaUserId: 1 }, 'c'),
    { $unwind: '$c' },
    { $match: { 'c.metaUserId': { $not: PREFIJO_CLIENTE_DEMO } } },
    { $group: { _id: '$motivo', conversaciones: { $sum: 1 }, eventos: { $sum: '$eventos' } } },
  ]);
}

/**
 * Conversaciones con IA: hilos con alguna respuesta del bot en el rango ∪ hilos transferidos en el
 * rango. La unión existe porque el handoff transfiere aunque el aviso de transición no salga (ventana
 * de 24 h, cuota): sin ella, `transferidas` podría superar al denominador.
 */
async function contarConversacionesIa(tenantOid: Types.ObjectId, r: Rango): Promise<number> {
  const rows = await aggregateScoped<{ n: number }>(Message, tenantOid, [
    { $match: { sender: 'bot', createdAt: { $gte: r.desde, $lte: r.hasta } } },
    { $group: { _id: '$clienteId' } },
    {
      $unionWith: {
        coll: AuditEvent.collection.name,
        // `aggregateScoped` solo antepone el `tenantId` a la colección de origen: la rama unida
        // tiene que filtrarlo ella misma.
        pipeline: [
          {
            $match: {
              tenantId: tenantOid,
              accion: ACCION_HANDOFF,
              entidad: 'cliente',
              createdAt: { $gte: r.desde, $lte: r.hasta },
            },
          },
          { $group: { _id: '$entidadId' } },
        ],
      },
    },
    { $group: { _id: '$_id' } },
    lookupScoped(Cliente.collection.name, tenantOid, '$_id', { metaUserId: 1 }, 'c'),
    { $unwind: '$c' },
    { $match: { 'c.metaUserId': { $not: PREFIJO_CLIENTE_DEMO } } },
    { $count: 'n' },
  ]);
  return rows[0]?.n ?? 0;
}

function esMotivo(valor: string | null): valor is HandoffMotivo {
  return (MOTIVOS_HANDOFF as readonly string[]).includes(valor ?? '');
}

export async function getHandoffRate(
  tenantId: string,
  q: HandoffRateQuery,
  now: Date = new Date(),
): Promise<IHandoffRateResponse> {
  const rango = resolverRango(q, now);
  const tenantOid = new Types.ObjectId(tenantId);

  const [porMotivo, conversacionesIa] = await Promise.all([
    contarTransferidas(tenantOid, rango),
    contarConversacionesIa(tenantOid, rango),
  ]);

  const transferidas = porMotivo.reduce((s, f) => s + f.conversaciones, 0);
  const handoffsRegistrados = porMotivo.reduce((s, f) => s + f.eventos, 0);
  const conteo = new Map<HandoffMotivo, number>();
  // `handoffConversation` siempre escribe un motivo válido; uno desconocido cuenta en
  // `transferidas` pero no tiene barra propia en el desglose.
  for (const f of porMotivo) if (esMotivo(f._id)) conteo.set(f._id, f.conversaciones);

  return {
    generadoAt: now.toISOString(),
    rango: { desde: rango.desde.toISOString(), hasta: rango.hasta.toISOString() },
    conversacionesIa,
    transferidas,
    resueltasPorIa: conversacionesIa - transferidas,
    handoffsRegistrados,
    tasaEscalamiento: ratio(transferidas, conversacionesIa),
    transferidasPorMotivo: MOTIVOS_HANDOFF.map((motivo) => ({ motivo, conversaciones: conteo.get(motivo) ?? 0 })),
  };
}

/* ─────────────────────────── HU-REP-03 — Productos más consultados ─────────────────────────── */

/** Grupos reservados de la agregación: nunca colisionan con una clave real (`normalizarClave`). */
const GRUPO_SIN_CLASIFICAR = '__sin';
const GRUPO_OTROS = '__otros';

interface FilaTema {
  _id: string;
  n: number;
  nombre: string | null;
}

/**
 * Consultas por tema: conversaciones con al menos un mensaje del CLIENTE en el rango, agrupadas por
 * su tema ACTUAL (`Cliente.temaIA`); sin demo ni huérfanos. Mismo molde que `contarAtendidas`, y la
 * misma limitación aceptada: si el tema de un hilo cambió, el periodo anterior va al tema nuevo.
 */
async function contarConsultasPorTema(tenantOid: Types.ObjectId, r: Rango): Promise<FilaTema[]> {
  return aggregateScoped<FilaTema>(Message, tenantOid, [
    { $match: { sender: 'user', createdAt: { $gte: r.desde, $lte: r.hasta } } },
    { $group: { _id: '$clienteId' } },
    lookupScoped(Cliente.collection.name, tenantOid, '$_id', { metaUserId: 1, temaIA: 1 }, 'c'),
    { $unwind: '$c' },
    { $match: { 'c.metaUserId': { $not: PREFIJO_CLIENTE_DEMO } } },
    {
      $group: {
        _id: {
          $cond: [
            { $ifNull: ['$c.temaIA', false] },
            { $ifNull: ['$c.temaIA.clave', GRUPO_OTROS] },
            GRUPO_SIN_CLASIFICAR,
          ],
        },
        n: { $sum: 1 },
        nombre: { $last: '$c.temaIA.nombre' },
      },
    },
  ]);
}

function compararProductos(a: ITopProductRow, b: ITopProductRow): number {
  return b.conversaciones - a.conversaciones || a.nombre.localeCompare(b.nombre, 'es');
}

export async function getTopProducts(
  tenantId: string,
  q: TopProductsQuery,
  now: Date = new Date(),
): Promise<ITopProductsResponse> {
  const rango = resolverRango(q, now);
  const tenantOid = new Types.ObjectId(tenantId);

  const [filas, { productos }] = await Promise.all([
    contarConsultasPorTema(tenantOid, rango),
    listarProductosKb(tenantId),
  ]);

  // El nombre vigente manda: si la empresa corrigió una tilde, el ranking la refleja ya. Lo que no
  // está en la KB conserva el nombre con el que se clasificó y se marca `enCatalogo: false`.
  const nombreVigente = new Map(productos.map((p) => [p.clave, p.nombre]));
  let sinClasificar = 0;
  let otros = 0;
  const porProducto: ITopProductRow[] = [];
  for (const f of filas) {
    if (f._id === GRUPO_SIN_CLASIFICAR) sinClasificar += f.n;
    else if (f._id === GRUPO_OTROS) otros += f.n;
    else {
      const vigente = nombreVigente.get(f._id);
      porProducto.push({
        clave: f._id,
        nombre: vigente ?? f.nombre ?? f._id,
        enCatalogo: vigente !== undefined,
        conversaciones: f.n,
        share: 0,
      });
    }
  }

  const totalConsultas = filas.reduce((s, f) => s + f.n, 0);
  const clasificadas = totalConsultas - sinClasificar;
  porProducto.sort(compararProductos);
  for (const fila of porProducto) fila.share = ratio(fila.conversaciones, clasificadas);

  const ranking = porProducto.slice(0, q.top);
  const fuera = porProducto.slice(q.top);
  const restantesConversaciones = fuera.reduce((s, f) => s + f.conversaciones, 0);

  return {
    generadoAt: now.toISOString(),
    rango: { desde: rango.desde.toISOString(), hasta: rango.hasta.toISOString() },
    catalogoDisponible: productos.length > 0,
    totalConsultas,
    clasificadas,
    sinClasificar,
    ranking,
    otros: { conversaciones: otros, share: ratio(otros, clasificadas) },
    restantes: {
      productos: fuera.length,
      conversaciones: restantesConversaciones,
      share: ratio(restantesConversaciones, clasificadas),
    },
  };
}
