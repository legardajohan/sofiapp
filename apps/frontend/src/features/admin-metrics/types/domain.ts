import type { EstadoTenant } from '../../admin-tenants/types/index.js';

/** Espejo de `IGlobalMetricsResponse` del backend (HU-SAAS-03). */

export type EstadoCampana =
  | 'borrador'
  | 'programada'
  | 'en_curso'
  | 'pausada'
  | 'completada'
  | 'cancelada'
  | 'fallida';

export type MetricsSortField =
  | 'nombre'
  | 'usuarios'
  | 'conversaciones'
  | 'mensajes'
  | 'leads'
  | 'ventas'
  | 'tasaConversion'
  | 'campanas';

export type SortOrder = 'asc' | 'desc';

export interface TenantMetricsRow {
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
  /** Fracción 0–1. */
  tasaConversion: number;
  campanas: number;
}

export interface PlanDistribution {
  planId: string | null;
  nombre: string;
  empresas: number;
}

export interface GlobalMetricsConsolidado {
  empresas: { total: number; porEstado: Record<EstadoTenant, number> };
  planes: PlanDistribution[];
  usuarios: { total: number; activos: number };
  conversaciones: { total: number; activas: number };
  mensajes: { inbound: number; outbound: number };
  leads: number;
  ventas: number;
  tasaConversion: number;
  campanas: { total: number; porEstado: Record<EstadoCampana, number> };
}

export interface MonthlyPoint {
  /** `YYYY-MM` (UTC). */
  periodo: string;
  conversaciones: number;
  leads: number;
  ventas: number;
}

export interface GlobalMetrics {
  generadoAt: string;
  rango: { desde: string | null; hasta: string | null } | null;
  consolidado: GlobalMetricsConsolidado;
  serieMensual: MonthlyPoint[];
  porEmpresa: { items: TenantMetricsRow[]; page: number; limit: number; total: number };
}
