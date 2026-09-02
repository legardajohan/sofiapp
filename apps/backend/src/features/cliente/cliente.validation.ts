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

/**
 * Confirmar datos extraídos (HU-IA-06). El cuerpo dice **qué** campos se aplican a la ficha, no con
 * qué valor: el valor es el que la IA extrajo y ya está persistido, así que aceptarlo por HTTP
 * abriría una vía para escribir `nombre` y `correo` saltándose el parche de HU-CRM-02.
 */
export const confirmarExtraccionSchema = z.object({
  body: z
    .object({
      campos: z
        .array(z.enum(['nombreCompleto', 'correo', 'telefono', 'interes']))
        .min(1, 'Indica al menos un campo para confirmar.')
        .max(4)
        .refine((c) => new Set(c).size === c.length, 'No repitas campos.'),
    })
    .strict(),
  params: z.object({ id: objectId }),
  query: empty,
});

// ─── Edición de la ficha (HU-CRM-02) ────────────────────────────────────────────

/**
 * Clave de una opción del catálogo del tenant (interés / objeción / rol). Misma forma que la `key`
 * de un atributo personalizado: la deriva el servidor al crear la opción y no vuelve a cambiar.
 */
const opcionKey = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'La opción debe ser una clave válida del catálogo.');

/** Slug estable: la UI lo deriva del label al crear el atributo y no lo vuelve a tocar. */
const atributoSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'La clave solo admite minúsculas, números, guion y guion bajo.'),
  label: z.string().trim().min(1, 'El atributo necesita un nombre.').max(60),
  valor: z.string().trim().min(1, 'El atributo necesita un valor.').max(500),
  sensible: z.boolean().default(false),
});

/**
 * Compara etiquetas como las lee una persona: "Colegio", "colegio" y "COLEGIO " son el mismo
 * atributo. Sin esta normalización la lista admitiría tres filas que en pantalla se leen igual y
 * nadie sabría cuál manda.
 */
function normalizarLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Un atributo repetido no es un error de forma sino de contenido, así que no lo puede atrapar el
 * schema de una fila: hay que mirar la lista entera. Se valida en el borde, igual que el resto, para
 * que el service reciba una lista ya coherente y el `$set` no llegue nunca con dos claves iguales.
 */
const atributosSchema = z
  .array(atributoSchema)
  .max(30, 'Un contacto admite como máximo 30 atributos personalizados.')
  .superRefine((atributos, ctx) => {
    const keys = new Set<string>();
    const labels = new Set<string>();

    atributos.forEach((atributo, i) => {
      if (keys.has(atributo.key)) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'key'],
          message: `La clave "${atributo.key}" está repetida.`,
        });
      }
      keys.add(atributo.key);

      const label = normalizarLabel(atributo.label);
      if (labels.has(label)) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'label'],
          message: `El atributo "${atributo.label}" está repetido.`,
        });
      }
      labels.add(label);
    });
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
      // El nombre es el único campo NO vaciable de la ficha: es como se identifica al contacto en
      // la bandeja, y un contacto sin nombre no se puede volver a encontrar. Por eso no lleva
      // `.nullable()` como los demás — se puede corregir, no borrar. Que un contacto llegue sin
      // nombre desde WhatsApp sigue siendo válido; lo que se prohíbe es dejarlo vacío a mano.
      nombre: z.string().trim().min(1, 'El nombre no puede quedar vacío.').max(120).optional(),
      // Tampoco es vaciable: `telefono` es obligatorio en el documento y es por donde se contacta a
      // la persona. Solo dígitos, con el indicativo y sin `+` ni separadores, igual que lo escribe
      // el webhook de Meta (`573001112233`) — dos formatos para el mismo dato harían que el mismo
      // número no se reconociera a sí mismo.
      telefono: z
        .string()
        .trim()
        .regex(/^\d{7,15}$/, 'El teléfono debe llevar entre 7 y 15 dígitos, sin espacios ni «+».')
        .optional(),
      correo: z.string().trim().toLowerCase().email('Correo inválido.').max(160).nullable().optional(),
      documento: z.string().trim().min(4).max(40).nullable().optional(),
      // Ya no son `z.enum`: interés, objeción y rol son catálogos por tenant (`contact_options`),
      // así que Zod solo puede comprobar la FORMA de la clave. Que exista y esté activa lo verifica
      // `assertOpcionesValidas` en el service, que es quien puede consultar el tenant.
      nivelInteres: opcionKey.nullable().optional(),
      objecionPrincipal: opcionKey.nullable().optional(),
      rolContacto: opcionKey.nullable().optional(),
      atributos: atributosSchema.optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Debes enviar al menos un campo para actualizar.'),
  params: z.object({ id: objectId }),
  query: empty,
});

export type HistoryQuery = z.infer<typeof historySchema>['query'];
export type UpdateClienteBody = z.infer<typeof updateClienteSchema>['body'];
