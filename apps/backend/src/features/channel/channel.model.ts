import { Schema, model } from 'mongoose';
import type { IMetaIntegrationDocument } from './channel.types.js';

const MetaIntegrationSchema = new Schema<IMetaIntegrationDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    canal: { type: String, enum: ['whatsapp'], required: true },
    wabaId: { type: String, required: true },
    phoneNumberId: { type: String, required: true },
    accessTokenEnc: { type: String, required: true, select: false },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

MetaIntegrationSchema.index({ phoneNumberId: 1 }, { unique: true });
MetaIntegrationSchema.index({ tenantId: 1, canal: 1 }, { unique: true });

export const MetaIntegration = model<IMetaIntegrationDocument>(
  'MetaIntegration',
  MetaIntegrationSchema,
);
