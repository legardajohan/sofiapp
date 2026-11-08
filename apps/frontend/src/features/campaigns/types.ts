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
  /** Enum fijo anterior a las etapas configurables. Ya no se ofrece; se conserva para campañas antiguas. */
  estadoComercial?: string[];
  tagIds?: string[];
  /** Keys del catálogo de etapas del CRM (`Lead.estado`). */
  etapas?: string[];
  /** Cómo se juntan etapas y etiquetas cuando vienen las dos. Ausente = `y`. */
  combinacion?: CombinacionSegmento;
  /** Contactos quitados a mano de la audiencia. Solo restan. */
  excluirClienteIds?: string[];
}

export type CombinacionSegmento = 'y' | 'o';

/** Tope de exclusiones a mano que acepta el backend. */
export const MAX_EXCLUSIONES = 1000;

/** De dónde sale el total: `coinciden = validos + bajas + bloqueados + excluidosAMano + duplicados`. */
export interface ResumenSegmentoDTO {
  coinciden: number;
  bajas: number;
  /** HU-MARK-07. Opcional: backend anterior. */
  bloqueados?: number;
  excluidosAMano: number;
  duplicados: number;
  validos: number;
}

export interface SegmentFacetasDTO {
  etapas: Array<{ key: string; contactos: number }>;
  etiquetas: Array<{ tagId: string; contactos: number }>;
}

export interface AudienciaContactoDTO extends ContactoResumenDTO {
  excluido: boolean;
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
  /** Teléfonos únicos a los que se escribirá. Igual a `resumen.validos`. */
  total: number;
  muestra: ContactoResumenDTO[];
  /** Opcional solo para tolerar un backend anterior al constructor de audiencias. */
  resumen?: ResumenSegmentoDTO;
  presupuesto: PresupuestoDTO;
}

// ─── HU-MARK-07 — audiencia por mensajes recientes ─────────────────────────────

export const RANGOS_AUDIENCIA = ['1d', '3d', '7d', 'custom'] as const;
export type RangoAudiencia = (typeof RANGOS_AUDIENCIA)[number];
export type TipoAudiencia = 'segmento' | 'mensajes_recientes';

/** Lo que se manda al backend. `desde`/`hasta` son días `YYYY-MM-DD`, solo en `custom`. */
export type AudienciaRecienteInput =
  | { tipo: 'mensajes_recientes'; rango: Exclude<RangoAudiencia, 'custom'> }
  | { tipo: 'mensajes_recientes'; rango: 'custom'; desde: string; hasta: string };

export type AudienciaInput = { tipo: 'segmento' } | AudienciaRecienteInput;

export interface AudiencePreviewDTO extends SegmentPreviewDTO {
  /** El rango resuelto por el servidor en la zona del tenant. El cliente no recalcula fechas. */
  rango: { desde: string; hasta: string; zonaHoraria: string };
}

/** Filtro aplicado que guarda la campaña (trazabilidad). */
export interface AudienciaCampanaDTO {
  tipo: TipoAudiencia;
  rango: RangoAudiencia | null;
  desde: string | null;
  hasta: string | null;
  zonaHoraria: string | null;
}

/** Etiqueta al enviar: una existente o un nombre (nueva, o reutiliza la del mismo nombre). */
export type EtiquetaEnvio = { tagId: string } | { nombre: string };

export interface TotalesCampana {
  destinatarios: number;
  enviados: number;
  entregados: number;
  fallidos: number;
  omitidos: number;
}

/** Imagen de cabecera de la campaña (HU-MARK-03). `url` es relativa a la base del API. */
/** Datos del contacto que un parámetro puede tomar por destinatario (HU-MARK-05). */
export const CAMPOS_CONTACTO = ['nombre', 'telefono'] as const;
export type CampoContacto = (typeof CAMPOS_CONTACTO)[number];

/**
 * El parámetro `indice` (0 = `{{1}}`) se rellena con `campo` de cada destinatario. Su texto de
 * respaldo —si el contacto no tiene el dato— es `parametros[indice]`.
 */
export interface ParametroDinamico {
  indice: number;
  campo: CampoContacto;
}

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
  parametrosDinamicos: ParametroDinamico[];
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
  /**
   * HU-CONF-01. La campaña sigue `en_curso`, pero espera a que abra el horario de envío: hasta
   * esta hora. `null` = no está retenida.
   */
  retenidaHasta: string | null;
  motivo: string | null;
  /** HU-MARK-07. Opcionales: backend anterior. */
  audiencia?: AudienciaCampanaDTO;
  etiqueta?: { id: string; nombre: string; color: string } | null;
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
  parametrosDinamicos?: ParametroDinamico[];
  lanzar?: boolean;
  programadaPara?: string;
  /**
   * HT-WA-04: imagen de reemplazo. No viaja en el JSON: `createCampaign` la sube antes con
   * `POST /campaigns/media` y manda su `imagenHeaderUploadId`. Sin ella, la imagen por defecto.
   */
  imagen?: File | null;
  /** HU-MARK-07. Sin ella, audiencia por filtros. */
  audiencia?: AudienciaInput;
  /**
   * HU-MARK-07. Con `lanzar` o `programadaPara`: se le pone a cada destinatario enviado con éxito,
   * ahora o cuando la campaña arranque a su hora.
   */
  etiqueta?: EtiquetaEnvio;
}

/** Programar una campaña (HU-MARK-03). Viaja como multipart: la imagen es un archivo aparte. */
export interface ScheduleCampaignPayload {
  nombre: string;
  filtros: SegmentoFiltros;
  templateId: string;
  parametros: string[];
  parametrosDinamicos?: ParametroDinamico[];
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
