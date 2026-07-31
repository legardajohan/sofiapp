import { Schema, model } from 'mongoose';
import type { IKbFaqDocument } from './kb-faq.types.js';

const KbFaqSchema = new Schema<IKbFaqDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    pregunta: { type: String, required: true, trim: true },
    respuesta: { type: String, required: true, trim: true },
    embedding: { type: [Number], required: true },
    activo: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

// Una misma pregunta no puede repetirse dentro del tenant (sí entre tenants distintos).
KbFaqSchema.index({ tenantId: 1, pregunta: 1 }, { unique: true });
KbFaqSchema.index({ tenantId: 1, createdAt: -1 });

// El índice de Atlas Vector Search NO se declara aquí (Mongoose no lo gestiona):
// se crea con scripts/create-kb-faq-vector-index.ts, igual que en kb-chunk.model.ts.

export const KbFaq = model<IKbFaqDocument>('KbFaq', KbFaqSchema);
