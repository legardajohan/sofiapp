import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
// No hace falta `.optional()`: `validate.middleware` normaliza `req.body ?? {}` antes de parsear.
const empty = z.object({});

export const listNotificationsSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(20),
  }),
});

export const readOneSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

export const readAllSchema = z.object({
  body: empty,
  params: empty,
  query: empty,
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>['query'];
