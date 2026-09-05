import { z } from 'zod';
import { env } from '../../config/env.js';
import { objectIdSchema } from '../../utils/validation.js';

const empty = z.object({});

/** Un término de búsqueda de una letra dispararía con casi cualquier mensaje. */
const termino = z.string().trim().min(2).max(80);

/**
 * Máximo 30 términos por lista. No es una limitación técnica: una empresa que necesita cincuenta
 * palabras clave para decidir cuándo escalar no está configurando reglas, está intentando que el
 * bot no conteste nunca — y para eso ya existe el interruptor de Sofi por conversación.
 */
const listaTerminos = z.array(termino).max(30);

/** Normaliza un nombre para comparar duplicados: sin mayúsculas y sin tildes. */
function normalizarNombre(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Una condición de transferencia creada por el admin (HU-IA-07). La `key` la deriva el cliente del
 * nombre al crearla y no vuelve a cambiar; aquí solo se valida su forma.
 */
const condicionExtra = z.object({
  key: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Clave de condición inválida.')
    .max(40),
  nombre: z.string().trim().min(2).max(40),
  activa: z.boolean(),
  // `.min(1)`: una condición sin palabras no puede dispararse nunca, así que guardarla dejaría al
  // admin creyendo que configuró algo. Mismo criterio que el umbral de `lowConfidence`.
  palabras: listaTerminos.min(1, 'Añade al menos una palabra que active la condición.'),
});

/**
 * Máximo 10. No es una limitación técnica: cada condición es una tarjeta más en una pantalla que ya
 * tiene cuatro, y a partir de ahí el admin deja de poder leer su propia configuración de un vistazo.
 *
 * Duplicados fuera, por `key` y por nombre normalizado. Molde: `atributosSchema` en
 * `cliente.validation.ts`, incluida la ruta del error por índice.
 */
const condicionesExtras = z
  .array(condicionExtra)
  .max(10, 'Como máximo 10 condiciones propias.')
  .superRefine((condiciones, ctx) => {
    const keys = new Set<string>();
    const nombres = new Set<string>();

    condiciones.forEach((c, i) => {
      if (keys.has(c.key)) {
        ctx.addIssue({ code: 'custom', path: [i, 'key'], message: `La clave "${c.key}" está repetida.` });
      }
      keys.add(c.key);

      const nombre = normalizarNombre(c.nombre);
      if (nombres.has(nombre)) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'nombre'],
          message: `La condición "${c.nombre}" está repetida.`,
        });
      }
      nombres.add(nombre);
    });
  });

export const getHandoffSettingsSchema = z.object({ body: empty, params: empty, query: empty });

/** Sin cuerpo, sin params y sin query: es una lectura agregada del tenant del token. */
export const asesorMetricasSchema = z.object({ body: empty, params: empty, query: empty });

export const updateHandoffSettingsSchema = z.object({
  body: z.object({
    activo: z.boolean(),
    // Se valida solo la forma. Que el usuario sea un admin ACTIVO DEL TENANT lo comprueba el
    // servicio con `assertAssignableAdmin`, porque este id llega del cuerpo de la petición y es el
    // único punto por el que podría colarse un usuario de otra empresa.
    asesorDestinoId: objectIdSchema.nullable(),
    estrategiaDestino: z.enum(['primero', 'menor_carga', 'fijo']),
    mensajeTransicion: z.string().trim().min(1).max(500),
    condicionesExtras: condicionesExtras,
    reglas: z.object({
      explicitRequest: z.object({ activa: z.boolean(), frases: listaTerminos }),
      keyword: z.object({ activa: z.boolean(), palabras: listaTerminos }),
      lowConfidence: z.object({
        activa: z.boolean(),
        // El umbral propio SOLO puede exigir MÁS que el global. `searchKnowledge` ya descarta todo
        // fragmento por debajo de `KB_MIN_SCORE`, así que un umbral menor describiría una regla
        // que no puede dispararse nunca: se rechaza en el borde en vez de dejar al admin creyendo
        // que configuró algo.
        umbral: z.number().min(env.KB_MIN_SCORE).max(1).nullable(),
      }),
      intentPurchase: z.object({
        activa: z.boolean(),
        nivelMinimo: z.enum(['tibio', 'caliente']),
      }),
    }),
  })
    .superRefine((body, ctx) => {
      if (body.estrategiaDestino === 'fijo' && body.asesorDestinoId === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['asesorDestinoId'],
          message: 'Elige a qué asesor se transfiere.',
        });
      }
      if (body.estrategiaDestino !== 'fijo' && body.asesorDestinoId !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['asesorDestinoId'],
          message: 'Con un reparto automático no se fija un asesor concreto.',
        });
      }
    }),
  params: empty,
  query: empty,
});

export type UpdateHandoffSettingsValidatedBody = z.infer<
  typeof updateHandoffSettingsSchema
>['body'];
