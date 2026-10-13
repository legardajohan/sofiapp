import { Document, Types } from 'mongoose';
import type { IImagenCabeceraAlmacenada } from '../media/media.types.js';

export const ESTADOS_PLANTILLA = [
  'APPROVED',
  'PENDING',
  'REJECTED',
  'PAUSED',
  'DISABLED',
  // HT-WA-04: Meta la está revisando de nuevo tras una apelación del rechazo.
  'IN_APPEAL',
] as const;
export type EstadoPlantilla = (typeof ESTADOS_PLANTILLA)[number];

/**
 * Formato de la cabecera de una plantilla, derivado de sus `components` (HU-MARK-03). `NINGUNA` si
 * no tiene `HEADER`. Solo `IMAGE` admite media en envío por ahora; `DOCUMENT` y `VIDEO` están fuera
 * de alcance y se rechazan al programar.
 */
export const FORMATOS_CABECERA = ['NINGUNA', 'TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO'] as const;
export type FormatoCabecera = (typeof FORMATOS_CABECERA)[number];

/** Media de cabecera ya subida a Meta, lista para ir como parámetro del `HEADER` en el envío. */
export interface ICabeceraEnvio {
  tipo: 'image';
  metaMediaId: string;
}

export const CATEGORIAS_PLANTILLA = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
export type CategoriaPlantilla = (typeof CATEGORIAS_PLANTILLA)[number];

/** Meta solo admite cabecera de imagen en estas categorías (HT-WA-04, criterio 3). */
export const CATEGORIAS_CON_IMAGEN: readonly CategoriaPlantilla[] = ['MARKETING', 'UTILITY'];

/** Largo máximo del FOOTER que acepta Meta. */
export const MAX_PIE_PLANTILLA = 60;

/**
 * Componente tal y como lo devuelve (o espera) la Graph API. Se persiste íntegro para poder
 * previsualizar sin volver a llamar a Meta. `example.body_text` es el mismo shape que usa Meta
 * para las plantillas creadas fuera de SofiApp: un array de "sets" de ejemplos, uno por variante.
 */
export interface IPlantillaComponente {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
  text?: string;
  buttons?: Array<Record<string, unknown>>;
  /**
   * `header_handle` (HT-WA-04): handle de la Resumable Upload API con la imagen de muestra. Se
   * declara en el schema para que la sincronización no lo pierda por el modo estricto de Mongoose.
   */
  example?: { body_text?: string[][]; header_handle?: string[] };
}

export interface IWhatsAppTemplate {
  tenantId: Types.ObjectId;
  metaTemplateId: string;
  name: string; // nombre aprobado por Meta (snake_case)
  language: string; // 'es', 'es_CO', 'en_US'
  category: CategoriaPlantilla;
  status: EstadoPlantilla;
  components: IPlantillaComponente[];
  /** Nº de placeholders {{n}} del BODY; se deriva al persistir para validar envíos sin re-parsear. */
  parametrosBody: number;
  syncedAt: Date;
  obsoleta: boolean; // Meta dejó de devolverla en el último sync
  /**
   * Imagen por defecto de la cabecera (HT-WA-04): la que se subió como muestra al crearla desde
   * SofiApp. `null` en las de solo texto y en las que llegan por sincronización desde Meta.
   */
  imagenDefecto: IImagenCabeceraAlmacenada | null;
  /** Código de Meta (`INVALID_FORMAT`, `PROMOTIONAL`…) si está rechazada; `null` si no. */
  motivoRechazo: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IWhatsAppTemplateDocument extends IWhatsAppTemplate, Document {
  _id: Types.ObjectId;
}

/** Documento leído con `.lean()`: sin métodos de Mongoose, con `_id` garantizado. */
export type LeanWhatsAppTemplate = IWhatsAppTemplate & { _id: Types.ObjectId };

// ─── DTOs / contratos HTTP ──────────────────────────────────────────────────

export interface IImagenPlantillaResponse {
  /** Relativa a la base del API: `/media/templates/<id>/imagen?t=…`. */
  url: string;
  mimeType: string;
  tamanoBytes: number;
}

export interface IMotivoRechazoResponse {
  codigo: string;
  mensaje: string;
}

export interface IWhatsAppTemplateResponse {
  id: string;
  name: string;
  language: string;
  category: CategoriaPlantilla;
  status: EstadoPlantilla;
  cuerpo: string | null;
  /** Set de ejemplo del BODY (si Meta o el alta local lo trajeron), para la vista previa. */
  ejemplos: string[];
  parametrosBody: number;
  /** Formato de la cabecera: el programador de campañas solo ofrece las de `IMAGE` (HU-MARK-03). */
  cabecera: FormatoCabecera;
  /** Texto del FOOTER, si lo tiene (HT-WA-04). */
  pie: string | null;
  /** Imagen por defecto con URL firmada (HT-WA-04). `null` si no tiene. */
  imagen: IImagenPlantillaResponse | null;
  motivoRechazo: IMotivoRechazoResponse | null;
  obsoleta: boolean;
  syncedAt: string;
}

export interface WhatsAppTemplatesListResponse {
  data: IWhatsAppTemplateResponse[];
  total: number;
  page: number;
  limit: number;
}

export type CabeceraAlta = { formato: 'NINGUNA' } | { formato: 'IMAGE'; uploadId: string };

export interface CreateTemplateBody {
  name: string;
  language: string;
  category: CategoriaPlantilla;
  cuerpo: string;
  ejemplos: string[];
  /** HT-WA-04: `NINGUNA` = solo texto (HT-WA-02); `IMAGE` consume la subida de `POST /templates/media`. */
  cabecera?: CabeceraAlta;
  pie?: string;
}

export interface ListTemplatesQuery {
  page: number;
  limit: number;
  status?: EstadoPlantilla;
  category?: CategoriaPlantilla;
}

export interface SyncTemplatesResponse {
  creadas: number;
  actualizadas: number;
  obsoletas: number;
}

/**
 * Motivos de rechazo de Meta en español (HT-WA-04, criterio 7). Un código que no esté aquí se
 * muestra con un texto genérico que incluye el código, para que soporte pueda buscarlo.
 */
export const MOTIVOS_RECHAZO: Readonly<Record<string, string>> = {
  INVALID_FORMAT: 'El formato no es válido: revisa las variables, los ejemplos y la ortografía.',
  ABUSIVE_CONTENT: 'Meta consideró que el contenido infringe sus políticas.',
  INCORRECT_CATEGORY: 'La categoría elegida no corresponde con el contenido del mensaje.',
  TAG_CONTENT_MISMATCH: 'La categoría elegida no corresponde con el contenido del mensaje.',
  PROMOTIONAL: 'El contenido es promocional y no corresponde a la categoría elegida.',
  SCAM: 'Meta consideró que el mensaje puede ser engañoso.',
  INVALID_MEDIA: 'Meta rechazó la imagen de la cabecera.',
};

/** Evento `message_template_status_update` ya resuelto a un tenant (HT-WA-04). */
export interface TemplateStatusJobData {
  tenantId: string;
  metaTemplateId: string;
  /** `APPROVED`, `REJECTED`, `PAUSED`, `REINSTATED`, `FLAGGED`, `PENDING_DELETION`… */
  evento: string;
  motivo: string | null;
}

export interface TemplateSyncTenantJobData {
  tenantId: string;
}
