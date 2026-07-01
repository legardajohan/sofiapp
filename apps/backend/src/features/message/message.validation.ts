import { z } from 'zod';

export const sendSchema = z.object({
  body: z.object({
    clienteId: z.string().min(1),
    texto: z.string().min(1).max(4096),
  }),
  params: z.object({}),
  query: z.object({}),
});
