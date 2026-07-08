import { z } from 'zod';

export const createDocumentSchema = z.object({
  body: z.object({
    titulo: z.string().trim().min(1, 'El título es obligatorio.').max(200),
    contenido: z.string().trim().min(1, 'El contenido es obligatorio.').max(100_000),
  }),
});

export const listDocumentsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});
