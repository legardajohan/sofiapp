import { Schema, model } from 'mongoose';
import type { ICostItemDocument } from './cost-catalog.types.js';

// Catálogo GLOBAL (sin `tenantId`), como `Plan`. Los importes en Decimal128 (ADR 0005).
const CostItemSchema = new Schema<ICostItemDocument>(
  {
    concepto: { type: String, required: true, trim: true },
    currency: { type: String, required: true, enum: ['COP', 'USD'] },
    unitCostOriginal: { type: Schema.Types.Decimal128 },
    fixedCostOriginal: { type: Schema.Types.Decimal128 },
    unit: { type: String },
    effectiveFrom: { type: Date, required: true, default: Date.now },
    active: { type: Boolean, required: true, default: true },
    fuente: { type: String },
  },
  { timestamps: true },
);

CostItemSchema.index({ active: 1, currency: 1 });

export const CostItem = model<ICostItemDocument>('CostItem', CostItemSchema, 'cost_items');
