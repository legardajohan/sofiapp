import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({}).optional();

// `mergeParams: true` en el router hace que `:clienteId` del montaje llegue hasta aquí.
const params = z.object({ clienteId: objectId });

export const createNotaSchema = z.object({
  body: z.object({
    texto: z.string().trim().min(1, 'La nota no puede estar vacía.').max(2000),
  }),
  params,
  query: empty,
});

export const listNotasSchema = z.object({
  body: empty,
  params,
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export type CreateNotaBody = z.infer<typeof createNotaSchema>['body'];
export type ListNotasQuery = z.infer<typeof listNotasSchema>['query'];
