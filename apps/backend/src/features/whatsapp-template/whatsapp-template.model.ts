import { Schema, model } from 'mongoose';
import { CATEGORIAS_PLANTILLA, ESTADOS_PLANTILLA } from './whatsapp-template.types.js';
import type { IWhatsAppTemplateDocument } from './whatsapp-template.types.js';

const ComponenteSchema = new Schema(
  {
    type: { type: String, enum: ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'], required: true },
    format: { type: String, enum: ['TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO'] },
    text: { type: String },
    buttons: { type: [Schema.Types.Mixed] },
    example: {
      type: new Schema({ body_text: { type: [[String]] } }, { _id: false }),
      required: false,
    },
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
  },
  { timestamps: true },
);

// Dos tenants distintos pueden tener plantillas homónimas en WABAs distintas: el único índice no
// encabezado por tenantId sería `metaTemplateId`, y por eso no se declara único global (a
// diferencia de `MetaIntegration.phoneNumberId`, que sí es único por construcción).
WhatsAppTemplateSchema.index({ tenantId: 1, name: 1, language: 1 }, { unique: true });
WhatsAppTemplateSchema.index({ tenantId: 1, status: 1 });

export const WhatsAppTemplate = model<IWhatsAppTemplateDocument>(
  'WhatsAppTemplate',
  WhatsAppTemplateSchema,
);
