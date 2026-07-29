import { z } from 'zod';

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
const CONTENIDO_MAX = 3000;
const CONTENIDO_MAX_MSG = 'El contenido no puede superar los 3,000 caracteres.';

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
      .max(CONTENIDO_MAX, CONTENIDO_MAX_MSG),
  }),
});

export const listDocumentsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const updateDocumentSchema = z.object({
  params: z.object({ id: z.string().regex(OBJECT_ID_REGEX, 'ID inválido') }),
  // El contenido puede quedar vacío (documento sin llenar); no se indexa hasta que tenga texto.
  body: z.object({
    contenido: z.string().trim().max(CONTENIDO_MAX, CONTENIDO_MAX_MSG),
  }),
});

export const deleteDocumentSchema = z.object({
  params: z.object({ id: z.string().regex(OBJECT_ID_REGEX, 'ID inválido') }),
});
