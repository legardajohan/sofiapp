import { z } from 'zod';

export const connectSchema = z.object({
  body: z.object({
    wabaId: z.string().min(1),
    phoneNumberId: z.string().min(1),
    accessToken: z.string().min(1),
  }),
  params: z.object({}),
  query: z.object({}),
});
