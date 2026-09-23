import { Document, Types } from 'mongoose';
import type { EstadoComercial } from '../cliente/cliente.types.js';
import type { MessagingTier, QualityRating } from '../channel/channel.types.js';

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
  estadoComercial?: EstadoComercial[];
  tagIds?: string[];
}

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

export interface ISegmentPreviewResponse {
  total: number;
  muestra: IContactoResumen[];
  presupuesto: IPresupuestoResponse;
}

export interface ICampaignResponse {
  id: string;
  nombre: string;
  estado: EstadoCampana;
  filtros: ISegmentoFiltros;
  templateId: string;
  parametros: string[];
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

export interface IPaged<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}
