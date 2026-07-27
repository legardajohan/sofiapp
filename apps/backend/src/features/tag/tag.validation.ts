import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

const nombre = z
  .string()
  .trim()
  .min(1, 'El nombre de la etiqueta no puede estar vacío.')
  .max(30, 'El nombre no puede superar los 30 caracteres.');

const color = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido: usa el formato #RRGGBB.');

export const listTagsSchema = z.object({
  body: empty,
  params: empty,
  query: empty,
});

export const createTagSchema = z.object({
  body: z.object({ nombre, color }),
  params: empty,
  query: empty,
});

export const updateTagSchema = z.object({
  // `refine` en vez de campos requeridos: un PATCH sin ningún cambio es un error del llamador,
  // no una operación válida que no hace nada.
  body: z
    .object({ nombre: nombre.optional(), color: color.optional() })
    .refine((b) => b.nombre !== undefined || b.color !== undefined, {
      message: 'Indica al menos un cambio: nombre o color.',
    }),
  params: z.object({ id: objectId }),
  query: empty,
});

export const deleteTagSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

export type CreateTagBody = z.infer<typeof createTagSchema>['body'];
export type UpdateTagBody = z.infer<typeof updateTagSchema>['body'];
