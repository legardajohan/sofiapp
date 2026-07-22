import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

export const listConversationsSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    filtro: z.enum(['todos', 'mios', 'sin_asignar', 'sofi']).default('todos'),
  }),
});

export const threadSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
  }),
});

export const replySchema = z.object({
  body: z.object({ texto: z.string().min(1).max(4096) }),
  params: z.object({ id: objectId }),
  query: empty,
});

export const readSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

export const iaSchema = z.object({
  body: z.object({ habilitada: z.boolean() }),
  params: z.object({ id: objectId }),
  query: empty,
});

export const summarySchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

export type ListConversationsQuery = z.infer<typeof listConversationsSchema>['query'];
export type ThreadQuery = z.infer<typeof threadSchema>['query'];
export type ReplyBody = z.infer<typeof replySchema>['body'];
export type IaBody = z.infer<typeof iaSchema>['body'];
