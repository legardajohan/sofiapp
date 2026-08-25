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

export const getHandoffSettingsSchema = z.object({ body: empty, params: empty, query: empty });

export const updateHandoffSettingsSchema = z.object({
  body: z.object({
    activo: z.boolean(),
    // Se valida solo la forma. Que el usuario sea un admin ACTIVO DEL TENANT lo comprueba el
    // servicio con `assertAssignableAdmin`, porque este id llega del cuerpo de la petición y es el
    // único punto por el que podría colarse un usuario de otra empresa.
    asesorDestinoId: objectIdSchema.nullable(),
    mensajeTransicion: z.string().trim().min(1).max(500),
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
  }),
  params: empty,
  query: empty,
});

export type UpdateHandoffSettingsValidatedBody = z.infer<
  typeof updateHandoffSettingsSchema
>['body'];
