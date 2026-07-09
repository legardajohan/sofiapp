import { z } from 'zod';
import { objectIdSchema } from '../../utils/validation.js';

const limitesSchema = z.object({
  usuarios: z.coerce.number().int().min(0),
  mensajesMes: z.coerce.number().int().min(0),
  leads: z.coerce.number().int().min(0),
  campanasMes: z.coerce.number().int().min(0),
});

export const listPlansSchema = z.object({
  query: z.object({
    // 'true' | 'false' → boolean (z.coerce.boolean trata "false" como true; evitamos esa trampa)
    activo: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  }),
});

export const createPlanSchema = z.object({
  body: z.object({
    nombre: z.string().min(2).max(60),
    limites: limitesSchema,
    precio: z.coerce.number().min(0),
    costoEstimado: z.coerce.number().min(0).optional(),
    activo: z.boolean().optional(),
  }),
});

export const updatePlanSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({
    nombre: z.string().min(2).max(60).optional(),
    limites: limitesSchema.partial().optional(),
    precio: z.coerce.number().min(0).optional(),
    costoEstimado: z.coerce.number().min(0).optional(),
    activo: z.boolean().optional(),
  }),
});
