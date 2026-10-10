export const ESTADOS_CAMPANA = [
  'borrador',
  'programada',
  'en_curso',
  'pausada',
  'completada',
  'cancelada',
  'fallida',
] as const;
export type EstadoCampana = (typeof ESTADOS_CAMPANA)[number];

export const ESTADOS_DESTINATARIO = [
  'pendiente',
  'enviado',
  'entregado',
  'fallido',
  'omitido',
] as const;
export type EstadoDestinatario = (typeof ESTADOS_DESTINATARIO)[number];

export type MessagingTier =
  | 'TIER_50'
  | 'TIER_250'
  | 'TIER_1K'
  | 'TIER_10K'
  | 'TIER_100K'
  | 'TIER_UNLIMITED';

export type QualityRating = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

/** Filtro por atributo personalizado del contacto. «Grado» entra por aquí, no como campo propio. */
export interface FiltroAtributo {
  key: string;
  valores: string[];
}

/** Intención de compra que clasifica la IA (HU-IA-05). Escala cerrada, no catálogo del tenant. */
export type IntencionCompra = 'frio' | 'tibio' | 'caliente';

export interface SegmentoFiltros {
  /** Ya no se ofrece en el constructor; se conserva para leer campañas antiguas. */
  atributos?: FiltroAtributo[];
  /** Ya no se ofrece en el constructor; se conserva para leer campañas antiguas. */
  rolContacto?: string[];
  /** Keys del catálogo de semáforos: el eje comercial del lead, no la etiqueta del hilo. */
  semaforoLead?: string[];
  nivelInteres?: string[];
  intencionCompra?: IntencionCompra[];
  estadoComercial?: string[];
  tagIds?: string[];
}

export interface PresupuestoDTO {
  tier: MessagingTier;
  calidad: QualityRating;
  limiteDiario: number;
  consumido24h: number;
  disponible: number;
  intervaloMs: number;
  bloqueado: boolean;
  motivoBloqueo: string | null;
}

export interface ContactoResumenDTO {
  id: string;
  nombre: string | null;
  telefono: string;
}

export interface SegmentPreviewDTO {
  total: number;
  muestra: ContactoResumenDTO[];
  presupuesto: PresupuestoDTO;
}

export interface TotalesCampana {
  destinatarios: number;
  enviados: number;
  entregados: number;
  fallidos: number;
  omitidos: number;
}

/** Imagen de cabecera de la campaña (HU-MARK-03). `url` es relativa a la base del API. */
export interface ImagenCampanaDTO {
  url: string;
  mimeType: 'image/jpeg' | 'image/png';
  tamanoBytes: number;
}

export interface CampaignDTO {
  id: string;
  nombre: string;
  estado: EstadoCampana;
  filtros: SegmentoFiltros;
  templateId: string;
  parametros: string[];
  imagen: ImagenCampanaDTO | null;
  totales: TotalesCampana;
  presupuesto: {
    tier: MessagingTier;
    calidad: QualityRating;
    limiteDiario: number;
    intervaloMs: number;
  } | null;
  programadaPara: string | null;
  iniciadaAt: string | null;
  finalizadaAt: string | null;
  motivo: string | null;
  createdAt: string;
}

export interface CampaignDetalleDTO extends CampaignDTO {
  plantilla: { id: string; name: string; language: string; cuerpo: string | null } | null;
  desglose: Record<EstadoDestinatario, number>;
}

export interface CampaignRecipientDTO {
  id: string;
  clienteId: string;
  telefono: string;
  estado: EstadoDestinatario;
  error: string | null;
  enviadoAt: string | null;
}

export interface PagedDTO<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export interface CreateCampaignPayload {
  nombre: string;
  filtros: SegmentoFiltros;
  templateId: string;
  parametros: string[];
  lanzar?: boolean;
  programadaPara?: string;
}

/** Programar una campaña (HU-MARK-03). Viaja como multipart: la imagen es un archivo aparte. */
export interface ScheduleCampaignPayload {
  nombre: string;
  filtros: SegmentoFiltros;
  templateId: string;
  parametros: string[];
  /** ISO-8601 con offset. */
  programadaPara: string;
  imagen: File | null;
}

/** Cambios sobre una campaña programada. Lo que no viene, no cambia. */
export interface RescheduleCampaignPayload {
  id: string;
  programadaPara?: string;
  imagen?: File;
}

// ─── Métricas (HU-MARK-04) ──────────────────────────────────────────────────────

/** Fracciones en [0, 1]; `null` cuando no hay base para calcularlas (p. ej. nada entregado aún). */
export interface TasasMetricas {
  /** entregados / enviados */
  entrega: number | null;
  /** leídos / entregados — mínima: no cuenta a quien apagó las confirmaciones de lectura. */
  apertura: number | null;
  /** respondidos / entregados */
  respuesta: number | null;
  /** convertidos / entregados */
  conversion: number | null;
}

export interface MetricasCampana {
  destinatarios: number;
  enviados: number;
  entregados: number;
  leidos: number;
  respondidos: number;
  convertidos: number;
  fallidos: number;
  tasas: TasasMetricas;
}

export interface VentanasAtribucion {
  respuestaHoras: number;
  conversionDias: number;
}

/** Lo que ocurrió un día, cada evento por su propia fecha, en la zona horaria del navegador. */
export interface PuntoSerie {
  /** `YYYY-MM-DD` */
  dia: string;
  enviados: number;
  respondidos: number;
  convertidos: number;
}

export interface CampaignMetricsDTO extends MetricasCampana {
  campaignId: string;
  ventanas: VentanasAtribucion;
  /** De su arranque al cierre de la ventana de conversión. Vacía si no ha arrancado. */
  serie: PuntoSerie[];
  calculadoAt: string;
}

export interface CampaignMetricsResumenDTO extends MetricasCampana {
  id: string;
  nombre: string;
  estado: EstadoCampana;
  iniciadaAt: string | null;
}

export interface CampaignsOverviewDTO extends MetricasCampana {
  desde: string;
  hasta: string;
  totalCampanas: number;
  /** Hasta 5, de mayor a menor tasa de respuesta. */
  campanas: CampaignMetricsResumenDTO[];
  ventanas: VentanasAtribucion;
  serie: PuntoSerie[];
  calculadoAt: string;
}
