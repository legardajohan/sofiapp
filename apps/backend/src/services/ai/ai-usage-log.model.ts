import { Schema, model, type Document, type Types } from 'mongoose';

export interface IAiUsageLog {
  tenantId: Types.ObjectId;
  method: 'chat' | 'extract' | 'classify';
  llmModel: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheHit: boolean;
  durationMs: number;
  createdAt?: Date;
}

export interface IAiUsageLogDocument extends IAiUsageLog, Document {}

const AiUsageLogSchema = new Schema<IAiUsageLogDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    method: { type: String, enum: ['chat', 'extract', 'classify'], required: true },
    llmModel: { type: String, required: true },
    promptTokens: { type: Number, required: true },
    completionTokens: { type: Number, required: true },
    totalTokens: { type: Number, required: true },
    cacheHit: { type: Boolean, required: true },
    durationMs: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AiUsageLogSchema.index({ tenantId: 1, createdAt: -1 });
// TTL: 90 días
AiUsageLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export const AiUsageLogModel = model<IAiUsageLogDocument>('AiUsageLog', AiUsageLogSchema);
