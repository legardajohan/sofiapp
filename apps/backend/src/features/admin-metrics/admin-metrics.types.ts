import type { EstadoTenant } from '../tenant/tenant.types.js';
import type { EstadoCampana } from '../campaign/campaign.types.js';

/**
 * HU-SAAS-03 — Métricas globales del SaaS (solo superadmin).
 * Ver `docs/specs/HU-SAAS-03-metricas-globales/spec.md` § Contrato del endpoint.
 */

/** Etapa del pipeline de leads que cuenta como venta (sembrada por `seed-estados`). */
export const KEY_ESTADO_VENTA = 'pagado';

/** Meses de la serie temporal del tablero. */
export const MESES_SERIE = 6;

/** Ventana de "conversación activa" cuando no se pide rango. */
export const DIAS_ACTIVIDAD_POR_DEFECTO = 30;

export const METRICS_SORT_FIELDS = [
  'nombre',
  'usuarios',
  'conversaciones',
  'mensajes',
  'leads',
  'ventas',
  'tasaConversion',
  'campanas',
] as const;
export type MetricsSortField = (typeof METRICS_SORT_FIELDS)[number];

export interface GlobalMetricsQuery {
  desde?: Date;
  hasta?: Date;
  page: number;
  limit: number;
  sort: MetricsSortField;
  order: 'asc' | 'desc';
  search?: string;
  estado?: EstadoTenant;
}

export interface ITenantMetricsRow {
  tenantId: string;
  nombre: string;
  slug: string;
  estado: EstadoTenant;
  plan: { _id: string; nombre: string } | null;
  usuarios: number;
  conversaciones: number;
  mensajes: number;
  leads: number;
  ventas: number;
  tasaConversion: number;
  campanas: number;
}

export interface IPlanDistribution {
  planId: string | null;
  nombre: string;
  empresas: number;
}

export interface IGlobalMetricsConsolidado {
  empresas: { total: number; porEstado: Record<EstadoTenant, number> };
  planes: IPlanDistribution[];
  usuarios: { total: number; activos: number };
  conversaciones: { total: number; activas: number };
  mensajes: { inbound: number; outbound: number };
  leads: number;
  ventas: number;
  tasaConversion: number;
  campanas: { total: number; porEstado: Record<EstadoCampana, number> };
}

export interface IMonthlyPoint {
  periodo: string; // 'YYYY-MM' (UTC)
  conversaciones: number;
  leads: number;
  ventas: number;
}

export interface IGlobalMetricsResponse {
  generadoAt: string;
  rango: { desde: string | null; hasta: string | null } | null;
  consolidado: IGlobalMetricsConsolidado;
  serieMensual: IMonthlyPoint[];
  porEmpresa: { items: ITenantMetricsRow[]; page: number; limit: number; total: number };
}
