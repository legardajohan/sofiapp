import { z } from 'zod';

export const placeholderSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({}),
});
