import type { Types } from 'mongoose';
import { Tenant } from '../tenant/tenant.model.js';
import { Plan } from '../plan/plan.model.js';
import { User } from '../users/user.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { Lead } from '../lead/lead.model.js';
import { Campaign } from '../campaign/campaign.model.js';
import { ESTADOS_CAMPANA, type EstadoCampana } from '../campaign/campaign.types.js';
import type { EstadoTenant } from '../tenant/tenant.types.js';
import {
  DIAS_ACTIVIDAD_POR_DEFECTO,
  KEY_ESTADO_VENTA,
  MESES_SERIE,
  type IGlobalMetricsConsolidado,
  type IGlobalMetricsResponse,
  type IMonthlyPoint,
  type IPlanDistribution,
  type ITenantMetricsRow,
  type MetricsSortField,
} from './admin-metrics.types.js';
import type { GlobalMetricsQueryInput } from './admin-metrics.validation.js';
import { DIA_MS, normalizeHasta, ratio } from '../../utils/date-range.util.js';

// Re-export: los tests de HU-SAAS-03 los importan desde aquí.
export { normalizeHasta, ratio };

/*
 * Excepción superadmin cross-tenant (docs/multi-tenancy.md §5.3).
 * Este es el ÚNICO archivo de la feature que lee modelos sin `*Scoped`: el superadmin no pertenece
 * a ningún tenant y el tablero cubre a todos. Cada agregación devuelve SOLO conteos agrupados por
 * `tenantId` — nunca documentos, campos de contacto ni textos de mensajes.
 */

const ESTADOS_TENANT: readonly EstadoTenant[] = ['activo', 'suspendido', 'prueba'];
const SIN_PLAN = 'Sin plan';

type CreatedAtMatch = { createdAt?: { $gte?: Date; $lte?: Date } };

interface TenantBase {
  _id: Types.ObjectId;
  nombre: string;
  slug: string;
  estado: EstadoTenant;
  planId?: Types.ObjectId | null;
}

interface CountsUsuarios { total: number; activos: number }
interface CountsConversaciones { total: number; activas: number }
interface CountsMensajes { inbound: number; outbound: number }
interface CountsLeads { leads: number; ventas: number }

// ── Helpers puros ────────────────────────────────────────────────────────────────────────────

function buildCreatedAtMatch(desde: Date | undefined, hasta: Date | undefined): CreatedAtMatch {
  if (!desde && !hasta) return {};
  return {
    createdAt: {
      ...(desde ? { $gte: desde } : {}),
      ...(hasta ? { $lte: hasta } : {}),
    },
  };
}

function periodoDe(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Los `n` periodos `YYYY-MM` consecutivos que terminan en el mes de `fin` (UTC), del más viejo al más nuevo. */
export function ultimosPeriodos(fin: Date, n: number): string[] {
  const periodos: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    periodos.push(periodoDe(new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() - i, 1))));
  }
  return periodos;
}

function zeroCampanas(): Record<EstadoCampana, number> {
  return Object.fromEntries(ESTADOS_CAMPANA.map((e) => [e, 0])) as Record<EstadoCampana, number>;
}

function toMap<T>(rows: Array<{ _id: Types.ObjectId | null } & T>): Map<string, T> {
  const map = new Map<string, T>();
  for (const { _id, ...rest } of rows) {
    if (_id) map.set(String(_id), rest as unknown as T);
  }
  return map;
}

// ── Agregaciones (excepción §5.3: solo conteos por tenantId) ────────────────────────────────

async function contarUsuarios(): Promise<Map<string, CountsUsuarios>> {
  // `tenantId: null` es el superadmin: no es usuario de ninguna empresa.
  const rows = await User.aggregate<{ _id: Types.ObjectId } & CountsUsuarios>([
    { $match: { tenantId: { $ne: null } } },
    {
      $group: {
        _id: '$tenantId',
        total: { $sum: 1 },
        activos: { $sum: { $cond: [{ $eq: ['$activo', true] }, 1, 0] } },
      },
    },
  ]);
  return toMap(rows);
}

async function contarConversaciones(
  match: CreatedAtMatch,
  actividadDesde: Date,
  actividadHasta: Date,
): Promise<Map<string, CountsConversaciones>> {
  const rows = await Cliente.aggregate<{ _id: Types.ObjectId } & CountsConversaciones>([
    { $match: match },
    {
      $group: {
        _id: '$tenantId',
        total: { $sum: 1 },
        activas: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ['$ultimoMensajeAt', actividadDesde] },
                  { $lte: ['$ultimoMensajeAt', actividadHasta] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  return toMap(rows);
}

async function contarMensajes(match: CreatedAtMatch): Promise<Map<string, CountsMensajes>> {
  const rows = await Message.aggregate<{ _id: Types.ObjectId } & CountsMensajes>([
    { $match: match },
    {
      $group: {
        _id: '$tenantId',
        inbound: { $sum: { $cond: [{ $eq: ['$direccion', 'inbound'] }, 1, 0] } },
        outbound: { $sum: { $cond: [{ $eq: ['$direccion', 'outbound'] }, 1, 0] } },
      },
    },
  ]);
  return toMap(rows);
}

async function contarLeads(match: CreatedAtMatch): Promise<Map<string, CountsLeads>> {
  const rows = await Lead.aggregate<{ _id: Types.ObjectId } & CountsLeads>([
    { $match: match },
    {
      $group: {
        _id: '$tenantId',
        leads: { $sum: 1 },
        ventas: { $sum: { $cond: [{ $eq: ['$estado', KEY_ESTADO_VENTA] }, 1, 0] } },
      },
    },
  ]);
  return toMap(rows);
}

async function contarCampanas(
  match: CreatedAtMatch,
): Promise<Map<string, Record<EstadoCampana, number>>> {
  const rows = await Campaign.aggregate<{ _id: { t: Types.ObjectId; e: EstadoCampana }; n: number }>([
    { $match: match },
    { $group: { _id: { t: '$tenantId', e: '$estado' }, n: { $sum: 1 } } },
  ]);
  const map = new Map<string, Record<EstadoCampana, number>>();
  for (const { _id, n } of rows) {
    const key = String(_id.t);
    const porEstado = map.get(key) ?? zeroCampanas();
    if (_id.e in porEstado) porEstado[_id.e] += n;
    map.set(key, porEstado);
  }
  return map;
}

/**
 * Serie mensual cross-tenant. Solo cuenta documentos de tenants existentes (`tenantIds`) para que
 * la serie cuadre con el desglose.
 */
async function serieMensual(
  tenantIds: Types.ObjectId[],
  fin: Date,
): Promise<IMonthlyPoint[]> {
  const periodos = ultimosPeriodos(fin, MESES_SERIE);
  const [primero] = periodos;
  const [anio, mes] = (primero ?? periodoDe(fin)).split('-').map(Number);
  const inicio = new Date(Date.UTC(anio ?? fin.getUTCFullYear(), (mes ?? 1) - 1, 1));
  const match = { tenantId: { $in: tenantIds }, createdAt: { $gte: inicio, $lte: fin } };
  const porMes = { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } };

  const [leads, conversaciones] = await Promise.all([
    Lead.aggregate<{ _id: string; leads: number; ventas: number }>([
      { $match: match },
      {
        $group: {
          _id: porMes,
          leads: { $sum: 1 },
          ventas: { $sum: { $cond: [{ $eq: ['$estado', KEY_ESTADO_VENTA] }, 1, 0] } },
        },
      },
    ]),
    Cliente.aggregate<{ _id: string; conversaciones: number }>([
      { $match: match },
      { $group: { _id: porMes, conversaciones: { $sum: 1 } } },
    ]),
  ]);

  const leadsPorMes = new Map(leads.map((r) => [r._id, r]));
  const convPorMes = new Map(conversaciones.map((r) => [r._id, r.conversaciones]));
  return periodos.map((periodo) => ({
    periodo,
    conversaciones: convPorMes.get(periodo) ?? 0,
    leads: leadsPorMes.get(periodo)?.leads ?? 0,
    ventas: leadsPorMes.get(periodo)?.ventas ?? 0,
  }));
}

// ── Composición ──────────────────────────────────────────────────────────────────────────────

function compararFilas(sort: MetricsSortField, order: 'asc' | 'desc') {
  const dir = order === 'asc' ? 1 : -1;
  return (a: ITenantMetricsRow, b: ITenantMetricsRow): number => {
    const porNombre = a.nombre.localeCompare(b.nombre, 'es');
    if (sort === 'nombre') return porNombre * dir;
    const diff = (a[sort] - b[sort]) * dir;
    return diff !== 0 ? diff : porNombre;
  };
}

function consolidar(
  tenants: TenantBase[],
  filas: ITenantMetricsRow[],
  planNombre: Map<string, string>,
  conversaciones: Map<string, CountsConversaciones>,
  mensajes: Map<string, CountsMensajes>,
  usuarios: Map<string, CountsUsuarios>,
  campanas: Map<string, Record<EstadoCampana, number>>,
): IGlobalMetricsConsolidado {
  const porEstado = Object.fromEntries(ESTADOS_TENANT.map((e) => [e, 0])) as Record<EstadoTenant, number>;
  const planes = new Map<string, IPlanDistribution>();
  for (const t of tenants) {
    if (t.estado in porEstado) porEstado[t.estado] += 1;
    const planId = t.planId ? String(t.planId) : null;
    const nombre = planId ? planNombre.get(planId) : undefined;
    // Un plan borrado del catálogo cuenta como "Sin plan": no hay nombre que mostrar.
    const clave = nombre && planId ? planId : SIN_PLAN;
    const actual = planes.get(clave) ?? {
      planId: nombre ? planId : null,
      nombre: nombre ?? SIN_PLAN,
      empresas: 0,
    };
    actual.empresas += 1;
    planes.set(clave, actual);
  }

  const totales = { activos: 0, activas: 0, inbound: 0, outbound: 0, leads: 0, ventas: 0 };
  const campanasPorEstado = zeroCampanas();
  for (const fila of filas) {
    totales.activos += usuarios.get(fila.tenantId)?.activos ?? 0;
    totales.activas += conversaciones.get(fila.tenantId)?.activas ?? 0;
    totales.inbound += mensajes.get(fila.tenantId)?.inbound ?? 0;
    totales.outbound += mensajes.get(fila.tenantId)?.outbound ?? 0;
    totales.leads += fila.leads;
    totales.ventas += fila.ventas;
    const c = campanas.get(fila.tenantId);
    if (c) for (const e of ESTADOS_CAMPANA) campanasPorEstado[e] += c[e];
  }

  return {
    empresas: { total: tenants.length, porEstado },
    planes: [...planes.values()].sort((a, b) => b.empresas - a.empresas || a.nombre.localeCompare(b.nombre, 'es')),
    usuarios: { total: filas.reduce((s, f) => s + f.usuarios, 0), activos: totales.activos },
    conversaciones: { total: filas.reduce((s, f) => s + f.conversaciones, 0), activas: totales.activas },
    mensajes: { inbound: totales.inbound, outbound: totales.outbound },
    leads: totales.leads,
    ventas: totales.ventas,
    tasaConversion: ratio(totales.ventas, totales.leads),
    campanas: { total: filas.reduce((s, f) => s + f.campanas, 0), porEstado: campanasPorEstado },
  };
}

/**
 * Tablero global del SaaS (HU-SAAS-03). Consolidado + desglose por empresa + serie mensual.
 * El consolidado se calcula sobre TODAS las empresas, antes de filtrar o paginar el desglose.
 */
export async function getGlobalMetrics(
  q: GlobalMetricsQueryInput,
  now: Date = new Date(),
): Promise<IGlobalMetricsResponse> {
  const desde = q.desde;
  const hasta = q.hasta ? normalizeHasta(q.hasta) : undefined;
  const match = buildCreatedAtMatch(desde, hasta);
  const actividadHasta = hasta ?? now;
  const actividadDesde = desde ?? new Date(actividadHasta.getTime() - DIAS_ACTIVIDAD_POR_DEFECTO * DIA_MS);

  const tenants = await Tenant.find({}, { nombre: 1, slug: 1, estado: 1, planId: 1 }).lean<TenantBase[]>();
  const tenantIds = tenants.map((t) => t._id);
  const planIds = [...new Set(tenants.flatMap((t) => (t.planId ? [String(t.planId)] : [])))];

  const [planes, usuarios, conversaciones, mensajes, leads, campanas, serie] = await Promise.all([
    Plan.find({ _id: { $in: planIds } }, { nombre: 1 }).lean<Array<{ _id: Types.ObjectId; nombre: string }>>(),
    contarUsuarios(),
    contarConversaciones(match, actividadDesde, actividadHasta),
    contarMensajes(match),
    contarLeads(match),
    contarCampanas(match),
    serieMensual(tenantIds, actividadHasta),
  ]);

  const planNombre = new Map(planes.map((p) => [String(p._id), p.nombre]));

  // Merge sobre los tenants EXISTENTES: un `tenantId` huérfano (empresa borrada) no genera fila.
  const filas: ITenantMetricsRow[] = tenants.map((t) => {
    const id = String(t._id);
    const planId = t.planId ? String(t.planId) : null;
    const planNom = planId ? planNombre.get(planId) : undefined;
    const m = mensajes.get(id);
    const l = leads.get(id);
    const c = campanas.get(id);
    const leadsN = l?.leads ?? 0;
    const ventasN = l?.ventas ?? 0;
    return {
      tenantId: id,
      nombre: t.nombre,
      slug: t.slug,
      estado: t.estado,
      plan: planId && planNom ? { _id: planId, nombre: planNom } : null,
      usuarios: usuarios.get(id)?.total ?? 0,
      conversaciones: conversaciones.get(id)?.total ?? 0,
      mensajes: (m?.inbound ?? 0) + (m?.outbound ?? 0),
      leads: leadsN,
      ventas: ventasN,
      tasaConversion: ratio(ventasN, leadsN),
      campanas: c ? ESTADOS_CAMPANA.reduce((s, e) => s + c[e], 0) : 0,
    };
  });

  const consolidado = consolidar(tenants, filas, planNombre, conversaciones, mensajes, usuarios, campanas);

  const search = q.search?.toLowerCase();
  const filtradas = filas
    .filter((f) => !q.estado || f.estado === q.estado)
    .filter((f) => !search || f.nombre.toLowerCase().includes(search) || f.slug.includes(search))
    .sort(compararFilas(q.sort, q.order));
  const inicio = (q.page - 1) * q.limit;

  return {
    generadoAt: now.toISOString(),
    rango: desde || hasta ? { desde: desde?.toISOString() ?? null, hasta: hasta?.toISOString() ?? null } : null,
    consolidado,
    serieMensual: serie,
    porEmpresa: {
      items: filtradas.slice(inicio, inicio + q.limit),
      page: q.page,
      limit: q.limit,
      total: filtradas.length,
    },
  };
}
