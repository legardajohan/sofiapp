import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
// `.optional()` es obligatorio: en Express 5 `req.body` queda `undefined` cuando la petición no
// trae cuerpo (Express 4 lo inicializaba en `{}`), así que un `z.object({})` a secas rechaza
// cualquier GET/PATCH sin body con "Required".
const empty = z.object({}).optional();

export const historySchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
  }),
});

export const extractSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

// ─── Edición de la ficha (HU-CRM-02) ────────────────────────────────────────────

/** Slug estable: la UI lo deriva del label al crear el atributo y no lo vuelve a tocar. */
const atributoSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'La clave solo admite minúsculas, números, guion y guion bajo.'),
  label: z.string().trim().min(1).max(60),
  valor: z.string().trim().min(1).max(500),
  sensible: z.boolean().default(false),
});

/**
 * `.strict()` es la pieza que hace cumplir el criterio 2 del spec: `telefono`, `metaUserId`,
 * `estadoComercial`, `tagIds`, `asesorId`, `tenantId` y `customFields` tienen dueño en otro sitio
 * (la identidad de WhatsApp, la máquina de estados de `domain.md` §3, HU-OMNI-04, HU-OMNI-02), y
 * dejarlos entrar por este parche sería una puerta trasera a esas reglas. Al ser estricto, la clave
 * desconocida falla **en el borde** con un 400 en vez de ignorarse en silencio.
 */
export const updateClienteSchema = z.object({
  body: z
    .object({
      nombre: z.string().trim().min(1).max(120).nullable().optional(),
      correo: z.string().trim().toLowerCase().email('Correo inválido.').max(160).nullable().optional(),
      documento: z.string().trim().min(4).max(40).nullable().optional(),
      nivelInteres: z.enum(['frio', 'tibio', 'caliente']).nullable().optional(),
      objecionPrincipal: z.enum(['precio', 'tiempo', 'confianza', 'otra']).nullable().optional(),
      rolContacto: z.enum(['decisor', 'usuario', 'desconocido']).nullable().optional(),
      atributos: z.array(atributoSchema).max(30).optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Debes enviar al menos un campo para actualizar.'),
  params: z.object({ id: objectId }),
  query: empty,
});

export type HistoryQuery = z.infer<typeof historySchema>['query'];
export type UpdateClienteBody = z.infer<typeof updateClienteSchema>['body'];
