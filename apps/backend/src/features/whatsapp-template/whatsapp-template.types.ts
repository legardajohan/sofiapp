import { Document, Types } from 'mongoose';

export const ESTADOS_PLANTILLA = ['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED'] as const;
export type EstadoPlantilla = (typeof ESTADOS_PLANTILLA)[number];

export const CATEGORIAS_PLANTILLA = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
export type CategoriaPlantilla = (typeof CATEGORIAS_PLANTILLA)[number];

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
  example?: { body_text?: string[][] };
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
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IWhatsAppTemplateDocument extends IWhatsAppTemplate, Document {
  _id: Types.ObjectId;
}

/** Documento leído con `.lean()`: sin métodos de Mongoose, con `_id` garantizado. */
export type LeanWhatsAppTemplate = IWhatsAppTemplate & { _id: Types.ObjectId };

// ─── DTOs / contratos HTTP ──────────────────────────────────────────────────

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
  obsoleta: boolean;
  syncedAt: string;
}

export interface WhatsAppTemplatesListResponse {
  data: IWhatsAppTemplateResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateTemplateBody {
  name: string;
  language: string;
  category: CategoriaPlantilla;
  cuerpo: string;
  ejemplos: string[];
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
