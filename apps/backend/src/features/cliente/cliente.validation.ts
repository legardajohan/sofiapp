import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

export const historySchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
  }),
});

export type HistoryQuery = z.infer<typeof historySchema>['query'];
