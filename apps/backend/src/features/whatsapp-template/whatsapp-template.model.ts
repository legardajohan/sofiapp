import { Schema, model } from 'mongoose';
import { MIMES_IMAGEN_CABECERA } from '../media/media.types.js';
import { CATEGORIAS_PLANTILLA, ESTADOS_PLANTILLA } from './whatsapp-template.types.js';
import type { IWhatsAppTemplateDocument } from './whatsapp-template.types.js';

const ComponenteSchema = new Schema(
  {
    type: { type: String, enum: ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'], required: true },
    format: { type: String, enum: ['TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO'] },
    text: { type: String },
    buttons: { type: [Schema.Types.Mixed] },
    example: {
      type: new Schema(
        {
          body_text: { type: [[String]], default: undefined },
          // HT-WA-04: sin declararlo, el modo estricto lo descartaba en cada sincronización.
          header_handle: { type: [String], default: undefined },
        },
        { _id: false },
      ),
      required: false,
    },
  },
  { _id: false },
);

/** Imagen por defecto de la cabecera (HT-WA-04), con la caché de su `media id` en Meta. */
const ImagenDefectoSchema = new Schema(
  {
    mediaKey: { type: String, required: true },
    mimeType: { type: String, enum: MIMES_IMAGEN_CABECERA, required: true },
    tamanoBytes: { type: Number, required: true },
    metaMediaId: { type: String, default: null },
    subidaMetaAt: { type: Date, default: null },
  },
  { _id: false },
);

const WhatsAppTemplateSchema = new Schema<IWhatsAppTemplateDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    metaTemplateId: { type: String, required: true },
    name: { type: String, required: true },
    language: { type: String, required: true },
    category: { type: String, enum: CATEGORIAS_PLANTILLA, required: true },
    status: { type: String, enum: ESTADOS_PLANTILLA, required: true },
    components: { type: [ComponenteSchema], required: true, default: [] },
    parametrosBody: { type: Number, required: true, default: 0 },
    syncedAt: { type: Date, required: true, default: Date.now },
    obsoleta: { type: Boolean, required: true, default: false },
    imagenDefecto: { type: ImagenDefectoSchema, default: null },
    motivoRechazo: { type: String, default: null },
  },
  { timestamps: true },
);

// Dos tenants distintos pueden tener plantillas homónimas en WABAs distintas: el único índice no
// encabezado por tenantId sería `metaTemplateId`, y por eso no se declara único global (a
// diferencia de `MetaIntegration.phoneNumberId`, que sí es único por construcción).
WhatsAppTemplateSchema.index({ tenantId: 1, name: 1, language: 1 }, { unique: true });
WhatsAppTemplateSchema.index({ tenantId: 1, status: 1 });
// HT-WA-04: el webhook `message_template_status_update` llega con el id de Meta, no con el nuestro.
WhatsAppTemplateSchema.index({ tenantId: 1, metaTemplateId: 1 });

export const WhatsAppTemplate = model<IWhatsAppTemplateDocument>(
  'WhatsAppTemplate',
  WhatsAppTemplateSchema,
);
