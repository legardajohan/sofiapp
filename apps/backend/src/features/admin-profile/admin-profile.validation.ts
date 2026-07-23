import { z } from 'zod';
import { objectIdSchema } from '../../utils/validation.js';

export const createAdminProfileSchema = z.object({
  body: z.object({
    nombre: z.string().min(2).max(60),
  }),
});

export const updateAdminProfileSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({
    nombre: z.string().min(2).max(60).optional(),
    activo: z.boolean().optional(),
  }),
});

export const adminProfileIdParamSchema = z.object({
  params: z.object({ id: objectIdSchema }),
});
