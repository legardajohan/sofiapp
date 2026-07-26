import { z } from 'zod';

export const listUsersSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    activo: z.coerce.boolean().optional().default(true),
    rol: z.enum(['admin']).optional().default('admin'),
  }),
});

export type ListUsersQuery = z.infer<typeof listUsersSchema>['query'];
