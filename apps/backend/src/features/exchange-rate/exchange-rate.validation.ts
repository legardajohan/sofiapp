import { z } from 'zod';

// Importe monetario como STRING decimal (no `coerce.number`: preserva precisión, evita binary float).
const decimalPositivo = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Debe ser un número decimal, p. ej. "3305.38".')
  .refine((v) => Number(v) > 0, 'Debe ser mayor que 0.');

export const manualRateSchema = z.object({
  body: z.object({
    valorCopPorUsd: decimalPositivo,
    fechaVigencia: z.coerce.date(),
    motivo: z.string().min(3).max(300),
    expiraEn: z.coerce.date().optional(),
  }),
});
