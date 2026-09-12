import { Schema, model } from 'mongoose';
import { COLOR_SEMAFORO_DEFECTO, type ISemaforoDocument } from './semaforo.types.js';

/**
 * Catálogo por tenant de la semaforización comercial de los leads (HU-CRM-04).
 * Ver `docs/data-model.md` § `semaforos`.
 */
const SemaforoSchema = new Schema<ISemaforoDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    key: { type: String, required: true, trim: true, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    color: { type: String, required: true, default: COLOR_SEMAFORO_DEFECTO, trim: true },
    orden: { type: Number, required: true, default: 0 },
    activo: { type: Boolean, required: true, default: true },
    esDefecto: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

// La clave identifica el semáforo dentro de su tenant. Único incluyendo los archivados: si no,
// "crear" uno con la misma clave que otro archivado duplicaría el valor que los leads ya llevan
// grabado. Mismo criterio que `estados`.
SemaforoSchema.index({ tenantId: 1, key: 1 }, { unique: true });

// Lectura del catálogo: siempre por tenant, en el orden que le dio la empresa.
SemaforoSchema.index({ tenantId: 1, orden: 1 });

export const Semaforo = model<ISemaforoDocument>('Semaforo', SemaforoSchema);
