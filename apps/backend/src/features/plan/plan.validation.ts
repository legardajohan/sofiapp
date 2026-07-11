import { z } from 'zod';
import { objectIdSchema } from '../../utils/validation.js';
import { PERFILES_BASE } from '../admin-profile/admin-profile.constants.js';

// Cada perfil permitido debe pertenecer al catálogo BASE global. Las etiquetas propias del tenant
// no se validan aquí (viven en admin_profiles, tenant-scoped).
const perfilesPermitidosSchema = z.array(z.enum(PERFILES_BASE));

const limitesSchema = z.object({
  usuarios: z.coerce.number().int().min(0),
  // administradores: obligatorio, entero, ≥ 1. Sin `.max` fijo: el tope es global y dinámico
  // (`PlatformSettings.maxAdministradoresPorPlan`), verificado en el service.
  administradores: z.coerce.number().int().min(1),
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
    descripcion: z.string().max(500).optional(),
    limites: limitesSchema,
    perfilesPermitidos: perfilesPermitidosSchema.optional(),
    precio: z.coerce.number().min(0),
    costoEstimado: z.coerce.number().min(0).optional(),
    activo: z.boolean().optional(),
  }),
});

export const planIdParamSchema = z.object({
  params: z.object({ id: objectIdSchema }),
});

export const updatePlanSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({
    nombre: z.string().min(2).max(60).optional(),
    descripcion: z.string().max(500).optional(),
    limites: limitesSchema.partial().optional(),
    perfilesPermitidos: perfilesPermitidosSchema.optional(),
    precio: z.coerce.number().min(0).optional(),
    costoEstimado: z.coerce.number().min(0).optional(),
    activo: z.boolean().optional(),
  }),
});
