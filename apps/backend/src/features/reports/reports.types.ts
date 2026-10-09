import type { HandoffMotivo } from '../ai/ai-handoff.types.js';

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

/*
 * HU-REP-02 — Tasa de escalamiento IA → asesor. Definiciones de "conversación con IA" y
 * "transferida": `docs/domain.md` § Tasa de escalamiento y
 * `docs/specs/HU-REP-02-tasa-de-escalamiento/spec.md`.
 */

/**
 * Fuente canónica del handoff. No `Cliente.handoffAt`: es el estado actual del hilo y
 * `setIaHabilitada(true)` lo borra al devolverle el hilo a Sofi, con lo que se perdería historial.
 */
export const ACCION_HANDOFF = 'conversation.handoff' as const;

export interface IHandoffMotivoRow {
  motivo: HandoffMotivo;
  conversaciones: number;
}

export interface IHandoffRateResponse {
  generadoAt: string;
  rango: { desde: string; hasta: string };
  /** Hilos con respuesta del bot en el rango ∪ hilos transferidos en el rango. */
  conversacionesIa: number;
  /** Conversaciones DISTINTAS con al menos un handoff en el rango. */
  transferidas: number;
  resueltasPorIa: number;
  /** Eventos de handoff detrás de `transferidas` (≥ transferidas: un hilo puede volver a escalar). */
  handoffsRegistrados: number;
  /** `transferidas / conversacionesIa`, 4 decimales; 0 sin conversaciones con IA. */
  tasaEscalamiento: number;
  /** Los motivos en el orden de `MOTIVOS_HANDOFF`, todos presentes; Σ = `transferidas`. */
  transferidasPorMotivo: IHandoffMotivoRow[];
}
