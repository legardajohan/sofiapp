import { Schema, model, type Document, type Types } from 'mongoose';

export interface IPromptSnapshot {
  method: 'chat' | 'extract' | 'classify' | 'summary';
  version: string;
  systemPrompt: string;
}

export interface IRetrievedChunk {
  texto: string;
  documentId: string;
  score?: number;
}

export interface IAiResponseContext {
  tenantId: Types.ObjectId;
  usageLogId: Types.ObjectId;
  promptSnapshot: IPromptSnapshot;
  retrievedChunks: IRetrievedChunk[];
  kbVersion: number | null;
  createdAt?: Date;
}

export interface IAiResponseContextDocument extends IAiResponseContext, Document {}

const AiResponseContextSchema = new Schema<IAiResponseContextDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    usageLogId: { type: Schema.Types.ObjectId, required: true, ref: 'AiUsageLog' },
    promptSnapshot: {
      method: { type: String, enum: ['chat', 'extract', 'classify', 'summary'], required: true },
      version: { type: String, required: true },
      systemPrompt: { type: String, required: true },
    },
    retrievedChunks: {
      type: [
        {
          texto: { type: String, required: true },
          documentId: { type: String, required: true },
          score: { type: Number, required: false },
          _id: false,
        },
      ],
      default: [],
    },
    kbVersion: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AiResponseContextSchema.index({ tenantId: 1, usageLogId: 1 }, { unique: true });
// Sin índice TTL: retención indefinida por diseño (auditoría). Ver docs/specs/HU-KB-04-contexto-ia/spec.md.

export const AiResponseContextModel = model<IAiResponseContextDocument>(
  'AiResponseContext',
  AiResponseContextSchema,
);
