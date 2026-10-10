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
  /**
   * HT-WA-04: imagen de reemplazo. No viaja en el JSON: `createCampaign` la sube antes con
   * `POST /campaigns/media` y manda su `imagenHeaderUploadId`. Sin ella, la imagen por defecto.
   */
  imagen?: File | null;
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
  /** HT-WA-04: vuelve a la imagen por defecto de la plantilla. Excluyente con `imagen`. */
  quitarImagen?: boolean;
}
