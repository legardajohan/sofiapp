import { z } from 'zod';

export const verifyQuerySchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    'hub.mode': z.literal('subscribe'),
    'hub.verify_token': z.string(),
    'hub.challenge': z.string(),
  }),
});
