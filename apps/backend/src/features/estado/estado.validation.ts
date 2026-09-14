import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');

// `.optional()`: en Express 5 `req.body` queda `undefined` sin cuerpo, y un `z.object({})` a secas
// rechazaría todo GET/DELETE con "Required" (mismo motivo que en `contact-option.validation`).
const empty = z.object({}).optional();

/** `#RRGGBB`, igual que el resto de catálogos coloreables del tenant. */
const colorHex = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'El color debe tener el formato #RRGGBB.');

const label = z
  .string()
  .trim()
  .min(1, 'El nombre del estado es obligatorio.')
  .max(60, 'El nombre no puede superar los 60 caracteres.');

export const listEstadosSchema = z.object({
  body: empty,
  params: empty,
  // `uso=true` añade a cada etapa cuántos leads la tienen. Va detrás de un parámetro y no en la
  // respuesta de siempre porque es una cuenta por etapa: la pide la pantalla que la muestra, no el
  // tablero ni los selectores, que se pintan en cada carga del listado.
  query: z.object({ uso: z.enum(['true', 'false']).optional() }),
});

export const createEstadoSchema = z.object({
  body: z.object({
    label,
    color: colorHex.optional(),
  }),
});

export const updateEstadoSchema = z.object({
  // Un PATCH sin ningún cambio es un error del llamador, no una operación válida que no hace nada.
  // `key` y `esDefecto` no son editables a propósito: la primera es el vínculo con los leads, la
  // segunda cuenta de dónde salió la etapa.
  body: z
    .object({
      label: label.optional(),
      color: colorHex.optional(),
      activo: z.boolean().optional(),
      esSalida: z.boolean().optional(),
      orden: z.number().int().min(0).max(999).optional(),
    })
    .strict()
    .refine(
      (b) => Object.keys(b).length > 0,
      'Indica al menos un cambio: nombre, color, orden, archivado o etapa de salida.',
    ),
  params: z.object({ id: objectId }),
  query: empty,
});

/**
 * El orden del embudo se manda **entero**, no etapa por etapa.
 *
 * Arrastrar una etapa de la posición 5 a la 2 cambia el `orden` de cuatro etapas, no de una. Con un
 * `PATCH { orden }` por etapa serían cuatro peticiones que pueden llegar desordenadas y dejar dos
 * etapas compartiendo posición; con la lista completa el servidor asigna 0..n-1 de una vez y el
 * resultado no depende del orden de llegada.
 */
export const reorderEstadosSchema = z.object({
  body: z
    .object({
      /** Los ids de **todas** las etapas del tenant, en el orden deseado. */
      ids: z.array(objectId).min(1, 'Indica el orden de las etapas.'),
    })
    .strict()
    .refine(
      (b) => new Set(b.ids).size === b.ids.length,
      'El orden trae la misma etapa más de una vez.',
    ),
  params: empty,
  query: empty,
});

export const deleteEstadoSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

export type ListEstadosQuery = z.infer<typeof listEstadosSchema>['query'];
export type CreateEstadoBody = z.infer<typeof createEstadoSchema>['body'];
export type UpdateEstadoBody = z.infer<typeof updateEstadoSchema>['body'];
export type ReorderEstadosBody = z.infer<typeof reorderEstadosSchema>['body'];
