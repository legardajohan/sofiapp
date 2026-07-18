import { Schema, model } from 'mongoose';
import type { IKbDocumentDocument } from './kb.types.js';

const KbDocumentSchema = new Schema<IKbDocumentDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    titulo: { type: String, required: true, trim: true },
    // Puede quedar vacío en presets sin llenar; el borde Zod exige contenido al crear vía HTTP.
    contenido: { type: String, default: '' },
    version: { type: Number, required: true, default: 1 },
    estadoIndexacion: {
      type: String,
      enum: ['pendiente', 'procesando', 'indexado', 'fallido'],
      default: 'pendiente',
    },
    chunkCount: { type: Number, default: 0 },
    isPreset: { type: Boolean, default: false },
    proposito: { type: String, required: false },
    error: { type: String },
  },
  { timestamps: true },
);

// Un documento por título dentro del tenant (re-subir = misma entidad, nueva versión).
KbDocumentSchema.index({ tenantId: 1, titulo: 1 }, { unique: true });
KbDocumentSchema.index({ tenantId: 1, createdAt: -1 });

export const KbDocument = model<IKbDocumentDocument>('KbDocument', KbDocumentSchema);
