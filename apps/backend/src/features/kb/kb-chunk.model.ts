import { Schema, model } from 'mongoose';
import type { IKbChunkDocument } from './kb.types.js';

const KbChunkSchema = new Schema<IKbChunkDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'KbDocument', required: true, index: true },
    version: { type: Number, required: true },
    chunkIndex: { type: Number, required: true },
    texto: { type: String, required: true },
    embedding: { type: [Number], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

KbChunkSchema.index({ tenantId: 1, documentId: 1, version: 1 });

// El índice vectorial de Atlas ($vectorSearch) NO es un índice Mongoose:
// se crea aparte con scripts/create-kb-vector-index.ts (campo tenantId como filtro).
export const KbChunk = model<IKbChunkDocument>('KbChunk', KbChunkSchema);
