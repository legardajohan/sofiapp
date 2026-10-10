import { Document, Types } from 'mongoose';
import type { EstadoComercial } from '../cliente/cliente.types.js';
import type { MessagingTier, QualityRating } from '../channel/channel.types.js';
import type { NivelInteres } from '../../integrations/llm/llm-provider.types.js';

/**
 * Ciclo de vida de una campaña (HU-MARK-01).
 *
 * ```
 * borrador ──lanzar──► en_curso ──┬──pausar──► pausada ──reanudar──► en_curso
 *     │                           ├──(sin pendientes)──► completada
 *     └──programar──► programada  └──cancelar──► cancelada
 *                         └──(llega la hora)──► en_curso
 * ```
 * `fallida` es el caso degenerado: se agotaron los destinatarios y no se envió ni uno.
 */
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

/** Estados en los que la campaña todavía puede consumir cupo del número. */
export const ESTADOS_CAMPANA_VIVOS: readonly EstadoCampana[] = ['programada', 'en_curso', 'pausada'];

/**
 * Qué le pasó a cada destinatario.
 *
 * `omitido` no es un fallo: es "no se le llegó a escribir" (la campaña se canceló antes de
 * alcanzarlo). Distinguirlo de `fallido` importa, porque un `fallido` es una señal de salud del
 * número y un `omitido` no dice nada sobre él.
 */
export const ESTADOS_DESTINATARIO = [
  'pendiente',
  'enviado',
  'entregado',
  'fallido',
  'omitido',
] as const;
export type EstadoDestinatario = (typeof ESTADOS_DESTINATARIO)[number];

/**
 * Filtro por atributo personalizado de `Cliente.atributos` (HU-CRM-02).
 *
 * Es por donde entra el "grado" de la historia. **No existe un campo `grado`** y no debe existir:
 * HU-CRM-02 sacó del schema los supuestos del vertical Pre-ICFES precisamente para que cada empresa
 * capture lo suyo. Segmentar por atributo genérico sirve igual para `colegio`, `EPS` o `presupuesto`.
 */
export interface IFiltroAtributo {
  key: string;
  valores: string[];
}

/** Escala de la IA para la intención de compra (HU-IA-05). Espejo de `NivelInteres`. */
export const INTENCIONES_COMPRA = ['frio', 'tibio', 'caliente'] as const satisfies readonly NivelInteres[];

export interface ISegmentoFiltros {
  atributos?: IFiltroAtributo[];
  /** Keys del catálogo `contact_options` tipo `rol` (institución, estudiante…). Dato del tenant. */
  rolContacto?: string[];
  /**
   * Keys del catálogo `semaforos` (HU-CRM-04) — el eje **comercial**, `Lead.semaforo`, no la
   * etiqueta de la conversación. `docs/domain.md` §5 lo deja escrito: MARK-01 resuelve por `key`,
   * nunca por nombre, y tolera que la clave no exista.
   */
  semaforoLead?: string[];
  nivelInteres?: string[];
  /**
   * Intención de compra que clasificó la IA (`Cliente.semaforoIA.nivelInteres`, HU-IA-05). Escala
   * cerrada del modelo, no catálogo del tenant. No confundir con `nivelInteres`, que es la clave
   * que una persona puso en la ficha.
   */
  intencionCompra?: NivelInteres[];
  /**
   * Ya no se ofrece en el constructor: `Cliente.estadoComercial` es el enum fijo anterior a
   * HU-CRM-03 y solo se escribe al dar de alta al contacto. La etapa real del CRM es `etapas`.
   */
  estadoComercial?: EstadoComercial[];
  tagIds?: string[];
  /**
   * Keys del catálogo `estados` (HU-CRM-03): la **etapa del CRM**, `Lead.estado`. Como el semáforo,
   * vive en el lead y se resuelve con un salto previo; una clave que no existe da un segmento vacío.
   */
  etapas?: string[];
  /**
   * Cómo se juntan **etapas y etiquetas** cuando vienen las dos: `y` = el contacto cumple ambas,
   * `o` = le basta con una. Ausente = `y`, que es lo que hacían todas las campañas hasta ahora. El
   * resto de ejes siempre se suma en AND: son refinamientos, no audiencias alternativas.
   */
  combinacion?: CombinacionSegmento;
  /**
   * Contactos que el usuario quitó a mano de la audiencia. Se aplican **después** de los filtros:
   * excluir no puede meter a nadie que los filtros no traían.
   */
  excluirClienteIds?: string[];
}

export const COMBINACIONES_SEGMENTO = ['y', 'o'] as const;
export type CombinacionSegmento = (typeof COMBINACIONES_SEGMENTO)[number];

/** Tope de exclusiones a mano. Por encima de esto el segmento está mal planteado, no le faltan clics. */
export const MAX_EXCLUSIONES_SEGMENTO = 1000;

/** Foto del presupuesto en el instante del lanzamiento. Explica a posteriori la cadencia elegida. */
export interface IPresupuestoCampana {
  tier: MessagingTier;
  calidad: QualityRating;
  limiteDiario: number;
  intervaloMs: number;
}

export interface ITotalesCampana {
  destinatarios: number;
  enviados: number;
  entregados: number;
  fallidos: number;
  omitidos: number;
}

/** Mimes de imagen de cabecera que Meta acepta en plantillas (HU-MARK-03). */
export const MIMES_IMAGEN_CAMPANA = ['image/jpeg', 'image/png'] as const;
export type MimeImagenCampana = (typeof MIMES_IMAGEN_CAMPANA)[number];

/**
 * Imagen de cabecera de una campaña (HU-MARK-03).
 *
 * El original vive en **nuestro** almacenamiento desde que se programa; `metaMediaId` es solo una
 * caché de la subida a Meta, que se hace al arrancar porque ese id caduca a los 30 días. Una
 * campaña programada a seis semanas vista no puede llevar un id pedido hoy.
 */
export interface IImagenCampana {
  /** `<tenantId>/campaigns/<campaignId>/<uuid>.<ext>` — ver `construirCampaignMediaKey`. */
  mediaKey: string;
  mimeType: MimeImagenCampana;
  tamanoBytes: number;
  metaMediaId: string | null;
  subidaMetaAt: Date | null;
}

export interface IContenidoCampana {
  imagen: IImagenCampana | null;
}

export interface ICampaign {
  tenantId: Types.ObjectId;
  nombre: string;
  filtros: ISegmentoFiltros;
  /**
   * Referencia al catálogo local de plantillas, **no el `name` suelto** que bocetaba
   * `data-model.md`: el nombre es lo que Meta puede cambiar, y una campaña histórica tiene que
   * seguir apuntando a la plantilla con la que se envió. Mismo criterio que `Tenant.recordatorio`.
   */
  templateId: Types.ObjectId;
  /** Parámetros del BODY, fijos para toda la campaña (el mail-merge por fila está fuera de alcance). */
  parametros: string[];
  /** Media que acompaña a la plantilla (HU-MARK-03). `{ imagen: null }` en las campañas de solo texto. */
  contenido: IContenidoCampana;
  estado: EstadoCampana;
  programadaPara: Date | null;
  totales: ITotalesCampana;
  presupuesto: IPresupuestoCampana | null;
  creadaPor: Types.ObjectId;
  iniciadaAt: Date | null;
  finalizadaAt: Date | null;
  /** Por qué acabó `fallida` o `cancelada`. `null` mientras no aplique. */
  motivo: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICampaignDocument extends ICampaign, Document {
  _id: Types.ObjectId;
}

/** Documento leído con `.lean()`: sin métodos de Mongoose, con `_id` garantizado. */
export type LeanCampaign = ICampaign & { _id: Types.ObjectId };

export interface ICampaignRecipient {
  tenantId: Types.ObjectId;
  campaignId: Types.ObjectId;
  clienteId: Types.ObjectId;
  telefono: string;
  estado: EstadoDestinatario;
  /** Puente con los `statuses` del webhook. `null` hasta que Meta acepta el envío. */
  metaMessageId: string | null;
  error: string | null;
  enviadoAt: Date | null;
  /**
   * Marcas de los eventos que alimentan las métricas (HU-MARK-04). `null` = no ocurrió, o la fila
   * es anterior a la medición. Se escriben **una vez**: cada escritura va condicionada a `null`.
   */
  entregadoAt: Date | null;
  /** `status: read` de Meta. Cota inferior: no llega si el contacto apagó las confirmaciones. */
  leidoAt: Date | null;
  /** Primer inbound del contacto dentro de `CAMPAIGN_REPLY_WINDOW_HOURS` tras el envío. */
  respondidoAt: Date | null;
  /** El lead entró a una etapa `esConversion` dentro de `CAMPAIGN_CONVERSION_WINDOW_DAYS`. */
  convertidoAt: Date | null;
}

export interface ICampaignRecipientDocument extends ICampaignRecipient, Document {
  _id: Types.ObjectId;
}

export type LeanCampaignRecipient = ICampaignRecipient & { _id: Types.ObjectId };

// ─── Datos de los jobs de la cola ───────────────────────────────────────────────

/**
 * Un lote de envío. Lleva el `tenantId` **dentro**: el worker no barre nada cross-tenant, procesa
 * la campaña de un tenant concreto y todas sus consultas vuelven a pasar por `*Scoped`.
 */
export interface CampaignJobData {
  tenantId: string;
  campaignId: string;
  lote: number;
}

/**
 * Arranque exacto de una campaña programada (HU-MARK-03). Lleva el tenant dentro, como el lote, y
 * la hora que lo originó: si la campaña se reprogramó después, `programadaParaMs` ya no coincide y
 * el job es un no-op. Así no hace falta perseguir ni borrar el job de la hora anterior.
 */
export interface CampaignStartJobData {
  tenantId: string;
  campaignId: string;
  programadaParaMs: number;
}

// ─── DTOs / contratos HTTP ──────────────────────────────────────────────────────

export interface CreateCampaignDTO {
  nombre: string;
  filtros: ISegmentoFiltros;
  templateId: string;
  parametros: string[];
  /** `true` = crear y arrancar en la misma petición. Incompatible con `programadaPara`. */
  lanzar?: boolean;
  /** ISO-8601. Deja la campaña en `programada`; la levanta el barrido al llegar la hora. */
  programadaPara?: string;
}

/** Alta de una campaña programada (HU-MARK-03). La imagen llega aparte, como archivo multipart. */
export interface ScheduleCampaignDTO {
  nombre: string;
  filtros: ISegmentoFiltros;
  templateId: string;
  parametros: string[];
  /** ISO-8601 con offset, al menos un minuto en el futuro. */
  programadaPara: string;
}

/** Cambios sobre una campaña `programada`. Todo opcional; `quitarImagen` la deja en solo texto. */
export type RescheduleCampaignDTO = Partial<ScheduleCampaignDTO> & { quitarImagen?: boolean };

/** Archivo recibido por multer, ya desacoplado de Express. */
export interface IImagenSubida {
  buffer: Buffer;
  mimeType: string;
  nombreArchivo: string;
}

export interface IImagenCampanaResponse {
  /** Relativa a la base del API: `/media/campaigns/<id>/imagen?t=…`. */
  url: string;
  mimeType: MimeImagenCampana;
  tamanoBytes: number;
}

/** Contacto resumido para la muestra del wizard. Nada sensible: ni correo ni documento. */
export interface IContactoResumen {
  id: string;
  nombre: string | null;
  telefono: string;
}

export interface IPresupuestoResponse {
  tier: MessagingTier;
  calidad: QualityRating;
  /** Techo del día tras aplicar margen de seguridad y factor de calidad. */
  limiteDiario: number;
  /** Destinatarios únicos de plantilla ya gastados en las últimas 24 h rodantes. */
  consumido24h: number;
  disponible: number;
  intervaloMs: number;
  bloqueado: boolean;
  motivoBloqueo: string | null;
}

/**
 * De dónde sale el `total` del segmento: cuántos casan con los filtros y por qué se cae cada uno.
 * `coinciden = validos + bajas + excluidosAMano + duplicados` siempre.
 */
export interface IResumenSegmento {
  /** Casan con los filtros, antes de quitar a nadie. */
  coinciden: number;
  /** Pidieron la baja de marketing: se excluyen siempre (criterio 3 de HU-MARK-01). */
  bajas: number;
  /** Quitados a mano por el usuario (`excluirClienteIds`). */
  excluidosAMano: number;
  /** Fichas con un teléfono que ya aparece en otra ficha del segmento: recibirían el mensaje dos veces. */
  duplicados: number;
  /** A quien de verdad se le escribe: un mensaje por teléfono. Es el mismo número que `total`. */
  validos: number;
}

export interface ISegmentPreviewResponse {
  /** Destinatarios reales (teléfonos únicos). Igual a `resumen.validos`. */
  total: number;
  muestra: IContactoResumen[];
  resumen: IResumenSegmento;
  presupuesto: IPresupuestoResponse;
}

/** Cuántos contactos alcanzables (sin baja) hay en cada etapa y en cada etiqueta. */
export interface ISegmentFacetasResponse {
  etapas: Array<{ key: string; contactos: number }>;
  etiquetas: Array<{ tagId: string; contactos: number }>;
}

/** Una fila del listado de la audiencia. `excluido` = el usuario lo quitó a mano. */
export interface IAudienciaContacto extends IContactoResumen {
  excluido: boolean;
}

export interface IAudienciaResponse {
  data: IAudienciaContacto[];
  page: number;
  limit: number;
  total: number;
}

export interface ICampaignResponse {
  id: string;
  nombre: string;
  estado: EstadoCampana;
  filtros: ISegmentoFiltros;
  templateId: string;
  parametros: string[];
  /** Imagen de cabecera con URL firmada de vida corta, o `null` si la campaña es solo texto. */
  imagen: IImagenCampanaResponse | null;
  totales: ITotalesCampana;
  presupuesto: IPresupuestoCampana | null;
  programadaPara: string | null;
  iniciadaAt: string | null;
  finalizadaAt: string | null;
  motivo: string | null;
  createdAt: string;
}

/** Detalle: añade la plantilla resuelta y el desglose vivo por estado de destinatario. */
export interface ICampaignDetalleResponse extends ICampaignResponse {
  plantilla: { id: string; name: string; language: string; cuerpo: string | null } | null;
  desglose: Record<EstadoDestinatario, number>;
}

export interface ICampaignRecipientResponse {
  id: string;
  clienteId: string;
  telefono: string;
  estado: EstadoDestinatario;
  error: string | null;
  enviadoAt: string | null;
}

// ─── Métricas (HU-MARK-04) ──────────────────────────────────────────────────────

/** Conteos de un conjunto de destinatarios. Salen de agregar `campaign_recipients`, no de contadores. */
export interface IConteosMetricas {
  destinatarios: number;
  /** Aceptados por Meta y no fallidos después: `estado ∈ { enviado, entregado }`. */
  enviados: number;
  entregados: number;
  leidos: number;
  respondidos: number;
  convertidos: number;
  fallidos: number;
}

/** Fracciones en [0, 1] con 4 decimales; `null` si el denominador es 0. */
export interface ITasasMetricas {
  /** entregados / enviados */
  entrega: number | null;
  /** leidos / entregados — cota inferior (ver `leidoAt`). */
  apertura: number | null;
  /** respondidos / entregados */
  respuesta: number | null;
  /** convertidos / entregados */
  conversion: number | null;
}

export interface ICampaignMetrics extends IConteosMetricas {
  tasas: ITasasMetricas;
}

export interface IVentanasAtribucion {
  respuestaHoras: number;
  conversionDias: number;
}

/**
 * Actividad de un día: cuántos envíos, respuestas y conversiones **ocurrieron** ese día (cada uno
 * por su propia marca de tiempo), en la zona horaria pedida. Los días sin actividad van con ceros:
 * una serie con huecos se dibuja como si no hubiera pasado el tiempo.
 */
export interface IPuntoSerie {
  /** `YYYY-MM-DD` en la zona horaria de la petición. */
  dia: string;
  enviados: number;
  respondidos: number;
  convertidos: number;
}

export interface ICampaignMetricsResponse extends ICampaignMetrics {
  campaignId: string;
  ventanas: IVentanasAtribucion;
  serie: IPuntoSerie[];
  calculadoAt: string;
}

export interface ICampaignMetricsResumen extends ICampaignMetrics {
  id: string;
  nombre: string;
  estado: EstadoCampana;
  iniciadaAt: string | null;
}

/** Agregado de las campañas iniciadas en un rango: la base del resumen de `/campanas`. */
export interface ICampaignsOverviewResponse extends ICampaignMetrics {
  desde: string;
  hasta: string;
  totalCampanas: number;
  /** Hasta 5, por tasa de respuesta descendente. */
  campanas: ICampaignMetricsResumen[];
  ventanas: IVentanasAtribucion;
  serie: IPuntoSerie[];
  calculadoAt: string;
}

export interface IPaged<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}
