import { Schema, model } from 'mongoose';
import {
  COLOR_OPCION_DEFECTO,
  TIPOS_OPCION_CONTACTO,
  type IContactOptionDocument,
} from './contact-option.types.js';

/**
 * Catálogo por tenant de las opciones de interés / objeción / rol de la ficha del contacto
 * (HU-CRM-02). Ver `docs/data-model.md` § `contact_options`.
 */
const ContactOptionSchema = new Schema<IContactOptionDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    tipo: { type: String, enum: TIPOS_OPCION_CONTACTO, required: true },
    key: { type: String, required: true, trim: true, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    // `default` y no `required`: los documentos sembrados antes de existir el color no lo tienen, y
    // el mapper de lectura cae al color de fábrica en vez de romper la respuesta. Ver `backfill`.
    color: { type: String, required: true, default: COLOR_OPCION_DEFECTO, trim: true },
    orden: { type: Number, required: true, default: 0 },
    activo: { type: Boolean, required: true, default: true },
    esDefecto: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

// La clave identifica la opción dentro de su catálogo y su tenant. Único, e incluyendo las
// archivadas: si no, "crear" una con la misma clave que otra archivada duplicaría el valor que ya
// llevan grabado los contactos. `createContactOption` reactiva la archivada en ese caso.
ContactOptionSchema.index({ tenantId: 1, tipo: 1, key: 1 }, { unique: true });

// Lectura del catálogo: siempre por tenant + tipo, ordenado.
ContactOptionSchema.index({ tenantId: 1, tipo: 1, orden: 1 });

export const ContactOption = model<IContactOptionDocument>('ContactOption', ContactOptionSchema);
