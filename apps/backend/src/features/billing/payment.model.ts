import { Schema, model } from 'mongoose';
import { ESTADOS_PAGO, PERIODOS_COBRO } from '@sofiapp/shared';
import type { IPaymentDocument } from './billing.types.js';

const AceptacionesSchema = new Schema(
  {
    tokenAceptacionWompi: { type: String, required: true },
    tokenDatosPersonalesWompi: { type: String, required: true },
    versionTerminosSofi: { type: String, required: true },
    versionPoliticaDatos: { type: String, required: true },
    aceptadoEn: { type: Date, required: true },
    ip: { type: String, required: true },
  },
  { _id: false },
);

const PrecioSchema = new Schema(
  {
    totalCop: { type: Schema.Types.Decimal128, required: true },
    baseCop: { type: Schema.Types.Decimal128, required: true },
    ivaCop: { type: Schema.Types.Decimal128, required: true },
    ivaPct: { type: String, required: true },
  },
  { _id: false },
);

const PaymentSchema = new Schema<IPaymentDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    reference: { type: String, required: true },
    providerTransactionId: { type: String, default: null },
    amountInCents: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: 'amountInCents debe ser entero' },
    },
    currency: { type: String, enum: ['COP'], default: 'COP', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    planVersion: { type: Number, required: true },
    periodo: { type: String, enum: PERIODOS_COBRO, required: true },
    precio: { type: PrecioSchema, required: true },
    estado: { type: String, enum: ESTADOS_PAGO, default: 'PENDIENTE', required: true },
    metodo: { type: String, default: null },
    detalleProveedor: { type: String, default: null, maxlength: 500 },
    aceptaciones: { type: AceptacionesSchema, required: true },
    expiraEn: { type: Date, required: true },
    intentadoPor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    finalizadoEn: { type: Date, default: null },
    origenTransicion: {
      type: String,
      enum: ['webhook', 'conciliacion', 'consulta', null],
      default: null,
    },
  },
  { timestamps: true, collection: 'payments' },
);

// `reference` y `providerTransactionId` son únicos GLOBALES, no por tenant: cumplen el papel que
// `phoneNumberId` cumple en el webhook de Meta (ADR 0022).
PaymentSchema.index({ reference: 1 }, { unique: true });
PaymentSchema.index(
  { providerTransactionId: 1 },
  { unique: true, partialFilterExpression: { providerTransactionId: { $type: 'string' } } },
);
PaymentSchema.index({ tenantId: 1, createdAt: -1 });
// Un solo intento PENDIENTE por tenant: la base de datos lo garantiza aunque dos peticiones corran
// a la vez. HU-BILL-02 decide si reutiliza o expira el anterior.
PaymentSchema.index(
  { tenantId: 1, estado: 1 },
  { unique: true, partialFilterExpression: { estado: 'PENDIENTE' } },
);
// Barrido de HT-PAY-03 (PENDIENTE vencidos): cross-tenant por naturaleza, por eso NO empieza por
// `tenantId`. Solo proyectará identificadores (multi-tenancy.md §5).
PaymentSchema.index({ estado: 1, expiraEn: 1 });

export const Payment = model<IPaymentDocument>('Payment', PaymentSchema);
