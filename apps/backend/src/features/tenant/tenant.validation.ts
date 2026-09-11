import { z } from 'zod';
import { objectIdSchema } from '../../utils/validation.js';

export const listTenantsSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),
});

export const createTenantSchema = z.object({
  body: z.object({
    nombre: z.string().min(2).max(100),
    slug: z
      .string()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9-]+$/, 'El slug solo puede contener letras minúsculas, números y guiones'),
    nit: z.string().optional(),
    contacto: z.object({
      email: z.string().email(),
      telefono: z.string().min(7),
    }),
    planId: objectIdSchema.optional(),
    adminUser: z
      .object({
        nombre: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(8),
      })
      .optional(),
  }),
});

export const updateTenantSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({
    nombre: z.string().min(2).max(100).optional(),
    nit: z.string().optional(),
    contacto: z
      .object({
        email: z.string().email().optional(),
        telefono: z.string().min(7).optional(),
      })
      .optional(),
    planId: objectIdSchema.optional(),
  }),
});

export const updateTenantStatusSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({
    estado: z.enum(['activo', 'suspendido']),
  }),
});

// HU-SAAS-02 — asignación de plan y consulta de uso
export const assignPlanSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({ planId: objectIdSchema }),
});

export const tenantIdParamSchema = z.object({
  params: z.object({ id: objectIdSchema }),
});

// HU-FLOW-02 — recordatorio de inactividad. Expuesto en `GET/PUT /api/flows/reminder`: el
// `admin` configura el de SU PROPIO tenant, sin `params.id` — el `tenantId` nace del token.
const empty = z.object({});

export const getReminderSchema = z.object({ body: empty, params: empty, query: empty });

export const updateReminderSchema = z.object({
  params: empty,
  query: empty,
  body: z.object({
    activo: z.boolean(),
    // 15 min: menos no da margen al barrido periódico. 1440 min (24 h): más no tiene sentido
    // contra una ventana de servicio que dura exactamente eso.
    antelacionMinutos: z.number().int().min(15).max(1440),
    texto: z.string().trim().max(4096),
    templateId: objectIdSchema.optional(),
  }),
});
