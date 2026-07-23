import { Schema, model } from 'mongoose';
import type { ITenantUsageDocument } from './usage.types.js';

// Colección tenant-scoped. Solo persiste los contadores MENSUALES (mensajesMes, campanasMes);
// `usuarios` y `leads` se derivan con countDocuments scoped en tiempo de consulta.
const TenantUsageSchema = new Schema<ITenantUsageDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    periodo: { type: String, required: true },
    mensajesMes: { type: Number, default: 0 },
    campanasMes: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Un documento por tenant y periodo (el cambio de periodo reinicia los contadores sin cron).
TenantUsageSchema.index({ tenantId: 1, periodo: 1 }, { unique: true });

export const TenantUsage = model<ITenantUsageDocument>(
  'TenantUsage',
  TenantUsageSchema,
  'tenant_usage',
);
