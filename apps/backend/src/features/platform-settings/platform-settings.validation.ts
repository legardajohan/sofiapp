import { z } from 'zod';

// PATCH parcial: el superadmin actualiza solo los campos que envíe (todos opcionales, con sus rangos).
export const updatePlatformSettingsSchema = z.object({
  body: z.object({
    maxAdministradoresPorPlan: z.coerce.number().int().min(1).optional(),
    proteccionCambiariaPct: z.coerce.number().min(0).max(20).optional(),
    utilidadPorDefectoPct: z.coerce.number().min(0).optional(),
  }),
});
