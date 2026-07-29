import { Schema, model } from 'mongoose';
import { SEMAFORO_SLUGS, type ITagDocument } from './tag.types.js';

const TagSchema = new Schema<ITagDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    nombre: { type: String, required: true, trim: true, maxlength: 30 },
    color: { type: String, required: true },
    semaforo: { type: String, enum: SEMAFORO_SLUGS },
  },
  { timestamps: true },
);

// Unicidad insensible a mayúsculas y acentos: "Urgente", "urgente" y "URGENTE" colisionan dentro
// del mismo tenant, que es lo que el administrador espera. `strength: 2` es lo que da esa
// insensibilidad; las consultas que dependan de ella deben usar la misma collation.
TagSchema.index(
  { tenantId: 1, nombre: 1 },
  { unique: true, collation: { locale: 'es', strength: 2 } },
);

// Una sola etiqueta por color de semáforo y tenant.
//
// `partialFilterExpression`, NO `sparse`: en un índice COMPUESTO, `sparse` incluye el documento si
// existe *cualquiera* de los campos indexados, y `tenantId` existe siempre. Con `sparse` esto
// pasaba a significar "una sola etiqueta con semaforo:null por tenant", es decir, un único tag
// normal por empresa. El índice parcial sí deja fuera a las etiquetas sin `semaforo`.
TagSchema.index(
  { tenantId: 1, semaforo: 1 },
  { unique: true, partialFilterExpression: { semaforo: { $exists: true } } },
);

export const Tag = model<ITagDocument>('Tag', TagSchema);
