import { Schema, model } from 'mongoose';
import { TIPOS_DATO_CAMPO, type IContactFieldDocument } from './contact-field.types.js';

/** Catálogo por tenant de campos personalizados del contacto (HU-FLOW-05). Ver `docs/data-model.md`. */
const ContactFieldSchema = new Schema<IContactFieldDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    key: { type: String, required: true, trim: true, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    labelNormalizado: { type: String, required: true, maxlength: 60 },
    tipoDato: { type: String, enum: TIPOS_DATO_CAMPO, required: true, default: 'texto' },
    sensible: { type: Boolean, required: true, default: false },
    orden: { type: Number, required: true, default: 0 },
    activo: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

// Únicos por tenant e incluyendo los archivados: reutilizar la clave o la etiqueta de uno archivado
// duplicaría el valor que ya llevan grabado los contactos. `createContactField` lo reactiva.
ContactFieldSchema.index({ tenantId: 1, key: 1 }, { unique: true });
ContactFieldSchema.index({ tenantId: 1, labelNormalizado: 1 }, { unique: true });
ContactFieldSchema.index({ tenantId: 1, activo: 1, orden: 1 });

export const ContactField = model<IContactFieldDocument>('ContactField', ContactFieldSchema);
