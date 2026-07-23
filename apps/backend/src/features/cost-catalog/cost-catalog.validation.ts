import { z } from 'zod';
import { objectIdSchema } from '../../utils/validation.js';

// Importe monetario como STRING decimal (no coerce.number): preserva precisión (ADR 0005).
const decimalNoNegativo = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Debe ser un número decimal, p. ej. "8000.00".');

const costBody = z.object({
  concepto: z.string().min(2).max(120),
  currency: z.enum(['COP', 'USD']),
  unitCostOriginal: decimalNoNegativo.optional(),
  fixedCostOriginal: decimalNoNegativo.optional(),
  unit: z.string().max(40).optional(),
  effectiveFrom: z.coerce.date().optional(),
  active: z.boolean().optional(),
  fuente: z.string().max(300).optional(),
});

export const createCostItemSchema = z.object({
  body: costBody.refine((b) => b.unitCostOriginal !== undefined || b.fixedCostOriginal !== undefined, {
    message: 'Debe indicar al menos un costo (unitario o fijo).',
  }),
});

export const updateCostItemSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: costBody.partial(),
});

export const costItemIdParamSchema = z.object({
  params: z.object({ id: objectIdSchema }),
});
