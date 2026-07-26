import type { Document, Types } from 'mongoose';
import type { z } from 'zod';
import type { Moneda } from '../../services/pricing/money.util.js';
import type { createCostItemSchema, updateCostItemSchema } from './cost-catalog.validation.js';

// Catálogo GLOBAL de costos (sin `tenantId`), gestionado por el superadmin. Cada concepto conserva
// su moneda original; la conversión a COP se hace en el costeo con la tasa vigente (ADR 0005).
export interface ICostItem {
  concepto: string;
  currency: Moneda;
  unitCostOriginal?: Types.Decimal128;
  fixedCostOriginal?: Types.Decimal128;
  unit?: string;
  effectiveFrom: Date;
  active: boolean;
  fuente?: string;
}

export interface ICostItemDocument extends ICostItem, Document {}

export interface ICostItemResponse {
  _id: string;
  concepto: string;
  currency: Moneda;
  unitCostOriginal?: string;
  fixedCostOriginal?: string;
  unit?: string;
  effectiveFrom: string;
  active: boolean;
  fuente?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateCostItemDTO = z.infer<typeof createCostItemSchema.shape.body>;
export type UpdateCostItemDTO = z.infer<typeof updateCostItemSchema.shape.body>;
