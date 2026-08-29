import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});
const aiMethod = z.enum(['chat', 'extract', 'classify', 'summary']);

export const getAiResponseContextSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

export const listAiResponsesSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    method: aiMethod.optional(),
  }),
});

export type ListAiResponsesValidatedQuery = z.infer<typeof listAiResponsesSchema>['query'];
