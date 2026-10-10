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

/** Espejo de `ITopProductRow` del backend (HU-REP-03). */
export interface TopProductRow {
  clave: string;
  nombre: string;
  /** `false` = el producto ya no está en la base de conocimiento. */
  enCatalogo: boolean;
  conversaciones: number;
  /** Fracción 0–1 sobre las conversaciones clasificadas. */
  share: number;
}

/** Espejo de `ITopProductsResponse` del backend (HU-REP-03). */
export interface TopProducts {
  generadoAt: string;
  rango: { desde: string; hasta: string };
  /** La base de conocimiento tiene productos cargados. Sin ellos no se clasifica nada. */
  catalogoDisponible: boolean;
  totalConsultas: number;
  clasificadas: number;
  sinClasificar: number;
  ranking: TopProductRow[];
  otros: { conversaciones: number; share: number };
  restantes: { productos: number; conversaciones: number; share: number };
}

/** Volumen de un bucket (HU-REP-04). `entrantes` es la demanda: lo que escriben los clientes. */
export interface MessageVolume {
  total: number;
  entrantes: number;
  salientes: number;
}

/** Espejo de `IPeakHoursResponse` del backend (HU-REP-04). */
export interface PeakHours {
  generadoAt: string;
  rango: { desde: string; hasta: string };
  /** Zona IANA con la que el backend agrupó; las horas y los días se leen en ella. */
  timezone: string;
  totales: { mensajes: number; entrantes: number; salientes: number };
  /** Siempre 24 filas, 0..23. */
  porHora: Array<MessageVolume & { hora: number }>;
  /** Un día por cada día del rango, `YYYY-MM-DD`. */
  porDia: Array<MessageVolume & { fecha: string }>;
  pico: { hora: number; entrantes: number } | null;
  diaPico: { fecha: string; entrantes: number } | null;
}
