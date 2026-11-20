import { Schema, model } from 'mongoose';
import { ESTADOS_SUSCRIPCION, ORIGENES_SUSCRIPCION, PERIODOS_COBRO } from '@sofiapp/shared';
import type { ISubscriptionDocument } from './billing.types.js';

const SubscriptionSchema = new Schema<ISubscriptionDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    estado: { type: String, enum: ESTADOS_SUSCRIPCION, default: 'sin_plan', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', default: null },
    planVersion: { type: Number, default: null },
    periodo: { type: String, enum: [...PERIODOS_COBRO, null], default: null },
    vigenciaDesde: { type: Date, default: null },
    vigenciaHasta: { type: Date, default: null },
    origen: { type: String, enum: [...ORIGENES_SUSCRIPCION, null], default: null },
    ultimoPagoId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
    renovacionAutomatica: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'subscriptions' },
);

// Una suscripción por tenant (el índice único cubre también el lookup por tenantId).
SubscriptionSchema.index({ tenantId: 1 }, { unique: true });

export const Subscription = model<ISubscriptionDocument>('Subscription', SubscriptionSchema);
