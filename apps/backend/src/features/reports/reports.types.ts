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

/*
 * HU-REP-03 — Productos más consultados. Definiciones de "consulta" y "tema": `docs/domain.md`
 * § Productos más consultados y `docs/specs/HU-REP-03-productos-mas-consultados/spec.md`.
 */

export const TOP_DEFAULT = 10;
export const TOP_MAX = 50;

export interface ITopProductRow {
  /** Nombre normalizado del producto: su identidad, porque las filas de la KB no tienen id. */
  clave: string;
  /** El nombre vigente en la KB; si el producto ya no está, el que se guardó al clasificar. */
  nombre: string;
  /** `false` = el producto ya no está en la KB (retirado o renombrado). */
  enCatalogo: boolean;
  conversaciones: number;
  /** `conversaciones / clasificadas`, 4 decimales. */
  share: number;
}

export interface ITopProductsResponse {
  generadoAt: string;
  rango: { desde: string; hasta: string };
  /** La KB del tenant tiene productos: sin ellos no hay vocabulario y nada se clasifica. */
  catalogoDisponible: boolean;
  /** Conversaciones con al menos un mensaje del cliente en el rango. */
  totalConsultas: number;
  /** `totalConsultas − sinClasificar`. Denominador de todos los `share`. */
  clasificadas: number;
  /** Conversaciones sin `temaIA` todavía. */
  sinClasificar: number;
  /** Los `top` productos con más conversaciones. Σ ranking + restantes + otros = clasificadas. */
  ranking: ITopProductRow[];
  /** Clasificadas sin producto que encaje. */
  otros: { conversaciones: number; share: number };
  /** Lo que queda fuera del corte `top`. */
  restantes: { productos: number; conversaciones: number; share: number };
}

/*
 * HU-REP-04 — Horas pico de mensajería. Definiciones de "demanda" y de la zona horaria:
 * `docs/domain.md` § Horas pico y `docs/specs/HU-REP-04-horas-pico-mensajeria/spec.md`.
 */

/** Zona por defecto: la misma lente que `admin-metrics` (los `createdAt` están en UTC). */
export const TZ_DEFAULT = 'UTC';

/**
 * El mayor desfase de una zona IANA respecto de UTC (Kiribati, +14 h). Ensancha la ventana UTC del
 * `$match` para que ningún día calendario de la zona quede cortado antes de filtrarlo por día local.
 */
export const DESFASE_MAX_MS = 14 * 60 * 60 * 1000;

export interface IVolumenMensajes {
  /** `entrantes + salientes`. */
  total: number;
  /** `direccion: 'inbound'`: lo que escriben los clientes. Es la demanda. */
  entrantes: number;
  /** `direccion: 'outbound'`: respuestas del bot y de los asesores, y envíos de plantilla. */
  salientes: number;
}

export interface IPeakHourRow extends IVolumenMensajes {
  /** Hora del día en `timezone`, 0..23. */
  hora: number;
}

export interface IPeakDayRow extends IVolumenMensajes {
  /** Día calendario en `timezone`, `YYYY-MM-DD`. */
  fecha: string;
}

export interface IPeakHoursResponse {
  generadoAt: string;
  /** Días calendario de `timezone`, expresados como medianoche y fin de día. */
  rango: { desde: string; hasta: string };
  /** La zona IANA con la que se agrupó. */
  timezone: string;
  totales: { mensajes: number; entrantes: number; salientes: number };
  /** Siempre 24 filas, 0..23, con las horas vacías en 0. */
  porHora: IPeakHourRow[];
  /** Un día por cada día del rango, con los vacíos en 0. */
  porDia: IPeakDayRow[];
  /** Hora con más entrantes (empate: la más temprana); `null` sin entrantes. */
  pico: { hora: number; entrantes: number } | null;
  /** Día con más entrantes (empate: el primero); `null` sin entrantes. */
  diaPico: { fecha: string; entrantes: number } | null;
}
