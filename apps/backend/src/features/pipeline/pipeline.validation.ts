import { z } from 'zod';
import type { SemaforoSlug } from '../tag/tag.types.js';
import { PIPELINE_LIMIT_DEFECTO, PIPELINE_LIMIT_MAXIMO } from './pipeline.types.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

/** Misma tupla local que el listado: Zod 3 exige `[string, ...string[]]` para `z.enum`. */
const SEMAFOROS = ['azul', 'rojo', 'naranja', 'verde'] as const satisfies readonly SemaforoSlug[];

/**
 * Filtros del tablero: los mismos que el listado **menos `page` y `estado`**.
 *
 * `estado` no se admite a propósito, y `.strict()` lo convierte en un `400` explícito en vez de
 * ignorarlo en silencio: el tablero ya agrupa por etapa, y filtrar por una sola devolvería un
 * embudo de una columna que la tabla dibuja mejor. Un `400` que dice qué llave sobra enseña el
 * contrato; ignorarla dejaría al cliente creyendo que filtró.
 *
 * No hay `page`: cada columna trae su primera página y su `total`. Recorrer 137 leads de una etapa
 * es trabajo de la tabla, que ya pagina.
 */
export const getPipelineSchema = z.object({
  body: empty,
  params: empty,
  query: z
    .object({
      limit: z.coerce
        .number()
        .int()
        .positive()
        .max(PIPELINE_LIMIT_MAXIMO)
        .default(PIPELINE_LIMIT_DEFECTO),
      // Es un userId (`Lead.responsableId`). No hay rol "Asesor": ver AUTH-02.
      asesor: objectId.optional(),
      semaforo: z.enum(SEMAFOROS).optional(),
      desde: z.coerce.date({ invalid_type_error: 'Fecha «desde» inválida.' }).optional(),
      hasta: z.coerce.date({ invalid_type_error: 'Fecha «hasta» inválida.' }).optional(),
    })
    .strict()
    .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, {
      message: 'El rango está invertido: «desde» no puede ser posterior a «hasta».',
      path: ['desde'],
    }),
});

export type GetPipelineQuery = z.infer<typeof getPipelineSchema>['query'];
