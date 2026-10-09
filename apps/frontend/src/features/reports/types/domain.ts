import type { HandoffMotivo } from '@/features/handoff/types';

/** Espejo de `IAdvisorReportResponse` del backend (HU-REP-01). */

export interface AdvisorRow {
  asesorId: string;
  nombre: string;
  activo: boolean;
  conversacionesAtendidas: number;
  asignadasActivas: number;
  ventas: number;
  /** Fracción 0–1. */
  tasaCierre: number;
}

export interface AdvisorReportTotales {
  asesores: number;
  conversacionesAtendidas: number;
  asignadasActivas: number;
  ventas: number;
  tasaCierre: number;
}

export interface AdvisorReport {
  generadoAt: string;
  rango: { desde: string; hasta: string };
  totales: AdvisorReportTotales;
  porAsesor: AdvisorRow[];
  sinAsignar: { conversacionesAtendidas: number; ventas: number };
}

/** Espejo de `IHandoffMotivoRow` del backend (HU-REP-02). */
export interface HandoffMotivoRow {
  motivo: HandoffMotivo;
  conversaciones: number;
}

/** Espejo de `IHandoffRateResponse` del backend (HU-REP-02). */
export interface HandoffRate {
  generadoAt: string;
  rango: { desde: string; hasta: string };
  /** Conversaciones con respuesta de Sofi o transferidas en el periodo. */
  conversacionesIa: number;
  /** Conversaciones distintas que Sofi transfirió a un asesor. */
  transferidas: number;
  resueltasPorIa: number;
  /** Eventos de transferencia (≥ transferidas: un hilo puede volver a escalar). */
  handoffsRegistrados: number;
  /** Fracción 0–1. */
  tasaEscalamiento: number;
  /** Los 5 motivos, siempre presentes, en orden de prioridad. */
  transferidasPorMotivo: HandoffMotivoRow[];
}
