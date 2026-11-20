import { Schema, model } from 'mongoose';
import { RESULTADOS_EVENTO } from './billing.types.js';
import type { IPaymentEventDocument } from './billing.types.js';

/**
 * Colección GLOBAL y append-only (ADR 0022). `tenantId` NO es requerido: el evento llega antes de
 * saber a quién pertenece y se rellena al resolverlo por `reference`. Es la excepción documentada
 * a "todo modelo lleva tenantId requerido".
 */
const PaymentEventSchema = new Schema<IPaymentEventDocument>(
  {
    claveIdempotencia: { type: String, required: true },
    evento: { type: String, required: true },
    transaccionId: { type: String, default: null },
    estadoReportado: { type: String, default: null },
    reference: { type: String, default: null },
    amountInCents: { type: Number, default: null },
    currency: { type: String, default: null },
    entorno: { type: String, enum: ['test', 'prod', null], default: null },
    recibidoEn: { type: Date, required: true, default: () => new Date() },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
    procesadoEn: { type: Date, default: null },
    resultado: { type: String, enum: [...RESULTADOS_EVENTO, null], default: null },
  },
  { timestamps: false, collection: 'payment_events' },
);

PaymentEventSchema.index({ claveIdempotencia: 1 }, { unique: true });
PaymentEventSchema.index({ reference: 1, recibidoEn: -1 });
PaymentEventSchema.index(
  { tenantId: 1, recibidoEn: -1 },
  { partialFilterExpression: { tenantId: { $type: 'objectId' } } },
);

export const PaymentEvent = model<IPaymentEventDocument>('PaymentEvent', PaymentEventSchema);
