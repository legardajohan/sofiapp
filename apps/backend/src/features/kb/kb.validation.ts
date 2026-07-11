import { z } from 'zod';

export const createDocumentSchema = z.object({
  body: z.object({
    titulo: z
      .string()
      .trim()
      .min(1, 'El título es obligatorio.')
      .max(200, 'El título no puede tener más de 200 caracteres.'),
    contenido: z
      .string()
      .trim()
      .min(1, 'El contenido es obligatorio.')
      .max(100_000, 'El contenido no puede superar los 100,000 caracteres.'),
  }),
});

export const listDocumentsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const deleteDocumentSchema = z.object({
  params: z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i, 'ID inválido') }),
});
