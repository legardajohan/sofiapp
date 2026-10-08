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
