import { Schema, model } from 'mongoose';
import { HEALTH_STATUSES, MESSAGING_TIERS, QUALITY_RATINGS } from './channel.types.js';
import type { IMetaIntegrationDocument } from './channel.types.js';

const MetaIntegrationSchema = new Schema<IMetaIntegrationDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    canal: { type: String, enum: ['whatsapp'], required: true },
    wabaId: { type: String, required: true },
    phoneNumberId: { type: String, required: true },
    accessTokenEnc: { type: String, required: true, select: false },
    activo: { type: Boolean, default: true },
    // Capacidad de envío del número (HU-MARK-01). Vive aquí y no en `Tenant` porque es del
    // NÚMERO: si una empresa cambiara de número, su tier y su calidad se van con él.
    // Deliberadamente SIN índice: se lee una vez por lanzamiento y por lote, siempre por tenant.
    messagingTier: { type: String, enum: MESSAGING_TIERS, required: true, default: 'TIER_250' },
    qualityRating: { type: String, enum: QUALITY_RATINGS, required: true, default: 'UNKNOWN' },
    healthStatus: { type: String, enum: HEALTH_STATUSES, required: true, default: 'UNKNOWN' },
    tierSyncedAt: { type: Date, default: null },
    tierManual: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

MetaIntegrationSchema.index({ phoneNumberId: 1 }, { unique: true });
MetaIntegrationSchema.index({ tenantId: 1, canal: 1 }, { unique: true });

export const MetaIntegration = model<IMetaIntegrationDocument>(
  'MetaIntegration',
  MetaIntegrationSchema,
);
