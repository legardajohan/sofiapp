import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

const estadoComercial = z.enum(['nuevo', 'en_gestion', 'pago_pendiente', 'pagado', 'perdido']);

export const listConversationsSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    filtro: z.enum(['todos', 'mios', 'sin_asignar', 'sofi']).default('todos'),
    asignadoA: z.union([objectId, z.literal('sin_asignar')]).optional(),
    estado: estadoComercial.optional(),
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

export const assignSchema = z.object({
  body: z.object({ asignadoA: objectId.nullable() }),
  params: z.object({ id: objectId }),
  query: empty,
});

export const assignmentsSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export type ListConversationsQuery = z.infer<typeof listConversationsSchema>['query'];
export type ThreadQuery = z.infer<typeof threadSchema>['query'];
export type ReplyBody = z.infer<typeof replySchema>['body'];
export type IaBody = z.infer<typeof iaSchema>['body'];
export type AssignBody = z.infer<typeof assignSchema>['body'];
export type AssignmentsQuery = z.infer<typeof assignmentsSchema>['query'];
