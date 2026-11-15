import { Types, type PipelineStage } from 'mongoose';
import { aggregateScoped, findScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { DIA_MS, inicioDelDiaUtc, normalizeHasta, ratio } from '../../utils/date-range.util.js';
import { Message } from '../message/message.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { filtroClientesReales, matchClientesReales } from '../cliente/cliente.filters.js';
import { Lead } from '../lead/lead.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { User } from '../users/user.model.js';
import { rolEmpresaDe, type IUserSource } from '../users/user.mapper.js';
import { idsDelFiltro } from '../users/user.grupos.js';
import { ActividadAsesor } from '../activity/activity.model.js';
import { KEY_ESTADO_VENTA } from '../estado/estado.types.js';
import { MOTIVOS_HANDOFF, type HandoffMotivo } from '../ai/ai-handoff.types.js';
import { listarProductosKb } from '../kb/kb-productos.reader.js';
import {
  ACCION_HANDOFF,
  ACCIONES_ETAPA_LEAD,
  DESFASE_MAX_MS,
  RANGO_DEFAULT_DIAS,
  RANGO_MAX_DIAS,
  type Granularidad,
  type IActivityPeriodRow,
  type IAdvisorActivityResponse,
  type IAdvisorReportResponse,
  type IAdvisorRow,
  type IRolDeFila,
  type IHandoffRateResponse,
  type IPeakDayRow,
  type IPeakHourRow,
  type IPeakHoursResponse,
  type ITopProductRow,
  type ITopProductsResponse,
} from './reports.types.js';
import type {
  AdvisorActivityQuery,
  AdvisorReportQuery,
  HandoffRateQuery,
  PeakHoursQuery,
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
    lookupScoped(Cliente.collection.name, tenantOid, '$_id', { asesorId: 1, metaUserId: 1, esPrueba: 1 }, 'c'),
    { $unwind: '$c' },
    { $match: matchClientesReales('c') },
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
        ...filtroClientesReales(),
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
    lookupScoped(Lead.collection.name, tenantOid, '$_id', { estado: 1, responsableId: 1, esPrueba: 1 }, 'l'),
    { $unwind: '$l' },
    { $match: { 'l.estado': KEY_ESTADO_VENTA, 'l.esPrueba': { $ne: true } } },
    { $group: { _id: { $ifNull: ['$l.responsableId', null] }, n: { $sum: 1 } } },
  ]);
  return toMap(rows);
}

/**
 * AUTH-06: ventas cerradas por usuario en un rango, con la MISMA definición que el reporte de
 * productividad (para que el reparto «más ventas cerradas» cuadre con lo que se ve en Reportes).
 * Lo usa el resolvedor de destinos; las ventas sin responsable no cuentan para nadie.
 */
export async function ventasPorUsuario(tenantId: string | Types.ObjectId, desde: Date, hasta: Date): Promise<Map<string, number>> {
  const tenantOid = tenantId instanceof Types.ObjectId ? tenantId : new Types.ObjectId(tenantId);
  const conteo = await contarVentas(tenantOid, { desde, hasta });
  const porUsuario = new Map<string, number>();
  for (const [id, n] of conteo) if (id) porUsuario.set(id, n);
  return porUsuario;
}

/**
 * Tiempo activo (HU-REP-06): segundos de las cubetas horarias de `ActividadAsesor` cuya hora cae en
 * el rango, por asesor. Mismo rango UTC que el resto del reporte, para que la fila cuadre consigo misma.
 */
async function sumarActividad(tenantOid: Types.ObjectId, r: Rango): Promise<Map<string | null, number>> {
  const rows = await aggregateScoped<Conteo>(ActividadAsesor, tenantOid, [
    { $match: { hora: { $gte: r.desde, $lte: r.hasta } } },
    { $group: { _id: '$userId', n: { $sum: '$segundosActivos' } } },
  ]);
  return toMap(rows);
}

function compararFilas(a: IAdvisorRow, b: IAdvisorRow): number {
  return b.conversacionesAtendidas - a.conversacionesAtendidas || a.nombre.localeCompare(b.nombre, 'es');
}

/** Lo mínimo de `User` para nombrar una fila y saber su rol y equipo (AUTH-06). */
const CAMPOS_ROL = { nombre: 1, activo: 1, rol: 1, rolEmpresa: 1, subrol: 1, coordinadorId: 1, esPrincipal: 1 } as const;

function rolDeFila(u: IUserSource): IRolDeFila {
  return {
    rolEmpresa: rolEmpresaDe(u) ?? null,
    coordinadorId: u.coordinadorId ? String(u.coordinadorId) : null,
    esPrincipal: u.esPrincipal === true,
  };
}

export async function getAdvisorReport(
  tenantId: string,
  q: AdvisorReportQuery,
  now: Date = new Date(),
): Promise<IAdvisorReportResponse> {
  const rango = resolverRango(q, now);
  const tenantOid = new Types.ObjectId(tenantId);

  const [atendidas, asignadas, ventas, actividad, usuarios] = await Promise.all([
    contarAtendidas(tenantOid, rango),
    contarAsignadasActivas(tenantOid, rango),
    contarVentas(tenantOid, rango),
    sumarActividad(tenantOid, rango),
    findScoped(User, tenantOid, {})
      .select(CAMPOS_ROL)
      .lean<IUserSource[]>(),
  ]);
  // AUTH-06: con `grupo`, solo las filas de ese grupo (404 si nombra a alguien de otro tenant).
  const delGrupo = q.grupo ? await idsDelFiltro(tenantOid, q.grupo) : null;

  const usados = new Set<string>();
  const porAsesor: IAdvisorRow[] = [];
  for (const u of usuarios) {
    const id = String(u._id);
    if (delGrupo && !delGrupo.has(id)) {
      // Fuera del grupo: tampoco es «sin asignar», así que cuenta como usado y no suma en totales.
      usados.add(id);
      continue;
    }
    const fila = {
      conversacionesAtendidas: atendidas.get(id) ?? 0,
      asignadasActivas: asignadas.get(id) ?? 0,
      ventas: ventas.get(id) ?? 0,
    };
    const segundosActivos = Math.round(actividad.get(id) ?? 0);
    const activo = u.activo !== false;
    const tieneCifras =
      fila.conversacionesAtendidas + fila.asignadasActivas + fila.ventas + segundosActivos > 0;
    usados.add(id);
    // Un inactivo sin cifras en el periodo no aporta nada y ensuciaría la gráfica.
    if (!activo && !tieneCifras) continue;
    porAsesor.push({
      asesorId: id,
      nombre: u.nombre,
      activo,
      ...rolDeFila(u),
      ...fila,
      tasaCierre: ratio(fila.ventas, fila.conversacionesAtendidas),
      segundosActivos,
    });
  }
  porAsesor.sort(compararFilas);

  // Lo que no es de ningún usuario del tenant (nulo o usuario borrado) va a "sin asignar", para
  // que los totales cuadren con los datos operativos (DoD).
  const huerfanos = (m: Map<string | null, number>): number =>
    [...m.entries()].reduce((s, [k, n]) => (k !== null && usados.has(k) ? s : s + n), 0);
  // Con un grupo, el reporte es de ese grupo: lo que no tiene dueño no le pertenece.
  const sinAsignar = delGrupo
    ? { conversacionesAtendidas: 0, ventas: 0 }
    : { conversacionesAtendidas: huerfanos(atendidas), ventas: huerfanos(ventas) };

  const suma = (k: 'conversacionesAtendidas' | 'asignadasActivas' | 'ventas' | 'segundosActivos'): number =>
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
      segundosActivos: suma('segundosActivos'),
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
    lookupScoped(Cliente.collection.name, tenantOid, '$_id', { metaUserId: 1, esPrueba: 1 }, 'c'),
    { $unwind: '$c' },
    { $match: matchClientesReales('c') },
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
    lookupScoped(Cliente.collection.name, tenantOid, '$_id', { metaUserId: 1, esPrueba: 1 }, 'c'),
    { $unwind: '$c' },
    { $match: matchClientesReales('c') },
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
    lookupScoped(Cliente.collection.name, tenantOid, '$_id', { metaUserId: 1, esPrueba: 1, temaIA: 1 }, 'c'),
    { $unwind: '$c' },
    { $match: matchClientesReales('c') },
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

/* ─────────────────────────── HU-REP-04 — Horas pico de mensajería ─────────────────────────── */

interface FilaHoraria {
  _id: { dia: string; hora: number };
  entrantes: number;
  salientes: number;
}

const HORAS_DEL_DIA = 24;

/** `YYYY-MM-DD` del instante, leído en UTC: así representa `resolverRango` los días calendario. */
const diaIso = (d: Date): string => d.toISOString().slice(0, 10);

/** Todos los días calendario del rango, en orden, para rellenar los vacíos con 0. */
function diasDelRango(r: Rango): string[] {
  const dias: string[] = [];
  for (let t = inicioDelDiaUtc(r.desde).getTime(); t <= r.hasta.getTime(); t += DIA_MS) {
    dias.push(diaIso(new Date(t)));
  }
  return dias;
}

/**
 * Mensajes por `{ día, hora }` en la zona `tz`, de clientes que existen y no son demo.
 *
 * Los días del rango se interpretan EN la zona: el `$match` inicial usa el índice
 * `{ tenantId, createdAt }` con una ventana UTC ensanchada ±14 h, y el filtro fino es por día local.
 * El `$lookup` va tras un primer `$group` por cliente para que lo acoten los pares cliente-hora y no
 * el volumen de mensajes.
 */
async function contarMensajesPorHora(tenantOid: Types.ObjectId, r: Rango, tz: string): Promise<FilaHoraria[]> {
  return aggregateScoped<FilaHoraria>(Message, tenantOid, [
    {
      $match: {
        createdAt: {
          $gte: new Date(r.desde.getTime() - DESFASE_MAX_MS),
          $lte: new Date(r.hasta.getTime() + DESFASE_MAX_MS),
        },
      },
    },
    {
      $addFields: {
        dia: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
        hora: { $hour: { date: '$createdAt', timezone: tz } },
      },
    },
    { $match: { dia: { $gte: diaIso(r.desde), $lte: diaIso(r.hasta) } } },
    {
      $group: {
        _id: { c: '$clienteId', dia: '$dia', hora: '$hora' },
        entrantes: { $sum: { $cond: [{ $eq: ['$direccion', 'inbound'] }, 1, 0] } },
        salientes: { $sum: { $cond: [{ $eq: ['$direccion', 'inbound'] }, 0, 1] } },
      },
    },
    lookupScoped(Cliente.collection.name, tenantOid, '$_id.c', { metaUserId: 1, esPrueba: 1 }, 'c'),
    { $unwind: '$c' },
    { $match: matchClientesReales('c') },
    {
      $group: {
        _id: { dia: '$_id.dia', hora: '$_id.hora' },
        entrantes: { $sum: '$entrantes' },
        salientes: { $sum: '$salientes' },
      },
    },
  ]);
}

/** El índice de la fila con más entrantes; empate → la primera. `-1` si ninguna tiene entrantes. */
function indiceDelPico(filas: Array<{ entrantes: number }>): number {
  let mejor = -1;
  filas.forEach((f, i) => {
    if (f.entrantes > 0 && (mejor === -1 || f.entrantes > (filas[mejor]?.entrantes ?? 0))) mejor = i;
  });
  return mejor;
}

export async function getPeakHours(
  tenantId: string,
  q: PeakHoursQuery,
  now: Date = new Date(),
): Promise<IPeakHoursResponse> {
  const rango = resolverRango(q, now);
  const filas = await contarMensajesPorHora(new Types.ObjectId(tenantId), rango, q.tz);

  const porHora: IPeakHourRow[] = Array.from({ length: HORAS_DEL_DIA }, (_, hora) => ({
    hora,
    total: 0,
    entrantes: 0,
    salientes: 0,
  }));
  const porDia: IPeakDayRow[] = diasDelRango(rango).map((fecha) => ({ fecha, total: 0, entrantes: 0, salientes: 0 }));
  const diaPorFecha = new Map(porDia.map((d) => [d.fecha, d]));

  for (const { _id, entrantes, salientes } of filas) {
    for (const fila of [porHora[_id.hora], diaPorFecha.get(_id.dia)]) {
      if (!fila) continue;
      fila.entrantes += entrantes;
      fila.salientes += salientes;
      fila.total += entrantes + salientes;
    }
  }

  const iHora = indiceDelPico(porHora);
  const iDia = indiceDelPico(porDia);
  const entrantes = porHora.reduce((s, f) => s + f.entrantes, 0);
  const salientes = porHora.reduce((s, f) => s + f.salientes, 0);

  return {
    generadoAt: now.toISOString(),
    rango: { desde: rango.desde.toISOString(), hasta: rango.hasta.toISOString() },
    timezone: q.tz,
    totales: { mensajes: entrantes + salientes, entrantes, salientes },
    porHora,
    porDia,
    pico: iHora === -1 ? null : { hora: iHora, entrantes: porHora[iHora]!.entrantes },
    diaPico: iDia === -1 ? null : { fecha: porDia[iDia]!.fecha, entrantes: porDia[iDia]!.entrantes },
  };
}

/* ─────────────────────────── HU-REP-06 — Tiempo activo del asesor ─────────────────────────── */

interface FilaActividad {
  _id: { dia: string; u: Types.ObjectId };
  s: number;
}

/**
 * Primer día del periodo al que pertenece `dia` (`YYYY-MM-DD`): el propio día, el lunes de su semana
 * ISO o el día 1 de su mes. Aritmética de calendario pura, sin zona: `dia` ya es un día local.
 */
export function periodoDe(dia: string, granularidad: Granularidad): string {
  if (granularidad === 'dia') return dia;
  if (granularidad === 'mes') return `${dia.slice(0, 7)}-01`;
  const fecha = new Date(`${dia}T00:00:00Z`);
  const desdeLunes = (fecha.getUTCDay() + 6) % 7;
  return diaIso(new Date(fecha.getTime() - desdeLunes * DIA_MS));
}

/**
 * Segundos activos por `{ día local, asesor }`. Igual que las horas pico, los días del rango se leen
 * EN la zona: ventana UTC ensanchada ±14 h sobre el índice `{ tenantId, hora, userId }` y filtro fino
 * por día local. Las cubetas son horas UTC, así que en zonas con desfase de media hora una cubeta
 * entera cae del lado de su inicio (error acotado, documentado en el spec).
 */
async function sumarActividadPorDia(
  tenantOid: Types.ObjectId,
  r: Rango,
  tz: string,
  asesorId: string | undefined,
): Promise<FilaActividad[]> {
  return aggregateScoped<FilaActividad>(ActividadAsesor, tenantOid, [
    {
      $match: {
        hora: {
          $gte: new Date(r.desde.getTime() - DESFASE_MAX_MS),
          $lte: new Date(r.hasta.getTime() + DESFASE_MAX_MS),
        },
        ...(asesorId ? { userId: new Types.ObjectId(asesorId) } : {}),
      },
    },
    { $addFields: { dia: { $dateToString: { format: '%Y-%m-%d', date: '$hora', timezone: tz } } } },
    { $match: { dia: { $gte: diaIso(r.desde), $lte: diaIso(r.hasta) } } },
    { $group: { _id: { dia: '$dia', u: '$userId' }, s: { $sum: '$segundosActivos' } } },
  ]);
}

export async function getAdvisorActivity(
  tenantId: string,
  q: AdvisorActivityQuery,
  now: Date = new Date(),
): Promise<IAdvisorActivityResponse> {
  const rango = resolverRango(q, now);
  const tenantOid = new Types.ObjectId(tenantId);
  // AUTH-06: `grupo` acota a un rol, equipo o usuario; `asesorId` (formato previo) es un usuario.
  const filtro = q.grupo ?? (q.asesorId ? { tipo: 'usuario' as const, usuarioId: q.asesorId } : null);
  const delGrupo = filtro && filtro.tipo !== 'usuario' ? await idsDelFiltro(tenantOid, filtro) : null;
  const unUsuario = filtro?.tipo === 'usuario' ? filtro.usuarioId : undefined;
  if (q.grupo?.tipo === 'usuario') await idsDelFiltro(tenantOid, q.grupo); // 404 si es de otro tenant
  const todas = await sumarActividadPorDia(tenantOid, rango, q.tz, unUsuario);
  const filas = delGrupo ? todas.filter((f) => delGrupo.has(String(f._id.u))) : todas;

  // Todos los periodos del rango, en orden, para que la gráfica no tenga huecos.
  const periodos = new Map<string, Map<string, number>>();
  for (const dia of diasDelRango(rango)) {
    const p = periodoDe(dia, q.granularidad);
    if (!periodos.has(p)) periodos.set(p, new Map());
  }

  const totalPorAsesor = new Map<string, number>();
  for (const { _id, s } of filas) {
    const porAsesor = periodos.get(periodoDe(_id.dia, q.granularidad));
    if (!porAsesor) continue;
    const id = String(_id.u);
    porAsesor.set(id, (porAsesor.get(id) ?? 0) + s);
    totalPorAsesor.set(id, (totalPorAsesor.get(id) ?? 0) + s);
  }

  // Solo usuarios que existen en el tenant: el tiempo de un usuario borrado no tiene a quién pintarse.
  const usuarios = await findScoped(User, tenantOid, {
    _id: { $in: [...totalPorAsesor.keys()].map((id) => new Types.ObjectId(id)) },
  })
    .select(CAMPOS_ROL)
    .lean<IUserSource[]>();
  const nombres = new Map(usuarios.map((u) => [String(u._id), u.nombre]));
  const roles = new Map(usuarios.map((u) => [String(u._id), rolDeFila(u)]));

  const asesores = [...totalPorAsesor.entries()]
    .filter(([id]) => nombres.has(id))
    .map(([asesorId, s]) => ({
      asesorId,
      nombre: nombres.get(asesorId) ?? '',
      totalSegundos: Math.round(s),
      ...(roles.get(asesorId) ?? { rolEmpresa: null, coordinadorId: null, esPrincipal: false }),
    }))
    .sort((a, b) => b.totalSegundos - a.totalSegundos || a.nombre.localeCompare(b.nombre, 'es'));

  const filasPeriodo: IActivityPeriodRow[] = [...periodos.entries()].map(([periodo, porAsesor]) => {
    const lista = asesores
      .map(({ asesorId }) => ({ asesorId, segundos: Math.round(porAsesor.get(asesorId) ?? 0) }))
      .filter((f) => f.segundos > 0);
    return { periodo, totalSegundos: lista.reduce((t, f) => t + f.segundos, 0), porAsesor: lista };
  });

  return {
    generadoAt: now.toISOString(),
    rango: { desde: rango.desde.toISOString(), hasta: rango.hasta.toISOString() },
    granularidad: q.granularidad,
    timezone: q.tz,
    asesores,
    periodos: filasPeriodo,
  };
}
