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

export interface SegmentoFiltros {
  atributos?: FiltroAtributo[];
  rolContacto?: string[];
  /** Keys del catálogo de semáforos: el eje comercial del lead, no la etiqueta del hilo. */
  semaforoLead?: string[];
  nivelInteres?: string[];
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

export interface CampaignDTO {
  id: string;
  nombre: string;
  estado: EstadoCampana;
  filtros: SegmentoFiltros;
  templateId: string;
  parametros: string[];
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
