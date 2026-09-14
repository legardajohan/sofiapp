import { Schema, model } from 'mongoose';
import { COLOR_ESTADO_DEFECTO, type IEstadoDocument } from './estado.types.js';

/**
 * Catálogo por tenant de las etapas del pipeline de leads (HU-CRM-03).
 * Ver `docs/data-model.md` § `estados`.
 */
const EstadoSchema = new Schema<IEstadoDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    key: { type: String, required: true, trim: true, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    color: { type: String, required: true, default: COLOR_ESTADO_DEFECTO, trim: true },
    orden: { type: Number, required: true, default: 0 },
    activo: { type: Boolean, required: true, default: true },
    esDefecto: { type: Boolean, required: true, default: false },
    // Sin índice: nadie filtra por él, es un dato de pintado (HU-PIPE-01).
    esSalida: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

// La clave identifica el estado dentro de su tenant. Único incluyendo los archivados: si no, "crear"
// uno con la misma clave que otro archivado duplicaría el valor que ya llevan grabado los leads.
EstadoSchema.index({ tenantId: 1, key: 1 }, { unique: true });

// Lectura del catálogo: siempre por tenant, en orden de pipeline.
EstadoSchema.index({ tenantId: 1, orden: 1 });

export const Estado = model<IEstadoDocument>('Estado', EstadoSchema);
