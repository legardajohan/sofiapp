import { z } from 'zod';

// Placeholder — CRUD completo se implementa en SAAS-02
export const createTenantSchema = {
  body: z.object({
    nombre: z.string().min(1),
    slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
    nit: z.string().optional(),
    contacto: z.object({
      email: z.string().email(),
      telefono: z.string().min(1),
    }),
    planId: z.string().length(24),
  }),
};
