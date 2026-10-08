/**
 * HU-REP-01 — Productividad por asesor (reporte de tenant).
 * Definiciones de "conversación atendida" y "venta cerrada": `docs/domain.md` § Productividad por
 * asesor y `docs/specs/HU-REP-01-reporte-por-asesor/spec.md`.
 */

/**
 * Acciones de auditoría que registran un cambio de etapa del lead. `lead.update` es la acción
 * anterior a HU-PIPE-01 (ya no se escribe): se lee para no perder ventas históricas.
 */
export const ACCIONES_ETAPA_LEAD = ['lead.estado', 'lead.update'] as const;

/** Prefijo de `metaUserId` de los clientes sembrados por el seed de demo (HU-OMNI-05). */
export const PREFIJO_CLIENTE_DEMO = /^demo-/;

export const RANGO_DEFAULT_DIAS = 30;
export const RANGO_MAX_DIAS = 366;

export interface IAdvisorRow {
  asesorId: string;
  nombre: string;
  activo: boolean;
  conversacionesAtendidas: number;
  asignadasActivas: number;
  ventas: number;
  /** `ventas / conversacionesAtendidas`, 4 decimales; 0 sin atendidas. */
  tasaCierre: number;
}

export interface IAdvisorReportTotales {
  asesores: number;
  conversacionesAtendidas: number;
  asignadasActivas: number;
  ventas: number;
  tasaCierre: number;
}

export interface IAdvisorReportResponse {
  generadoAt: string;
  rango: { desde: string; hasta: string };
  totales: IAdvisorReportTotales;
  porAsesor: IAdvisorRow[];
  /** Atendidas/ventas cuyo asesor o responsable es nulo o ya no existe en el tenant. */
  sinAsignar: { conversacionesAtendidas: number; ventas: number };
}
