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

// ─── Chatbot con RAG (HU-IA-01) ─────────────────────────────────────────────

export const aiAnswerSchema = z.object({
  // 2000 caracteres: por encima de eso no es una pregunta, y un mensaje de WhatsApp tampoco
  // llega tan lejos.
  body: z.object({ mensaje: z.string().min(1).max(2000) }),
  params: empty,
  query: empty,
});

export const getAssistantSchema = z.object({ body: empty, params: empty, query: empty });

export const updateAssistantSchema = z.object({
  body: z.object({
    tono: z.string().min(1).max(200),
    systemPrompt: z.string().min(1).max(8000),
  }),
  params: empty,
  query: empty,
});

export type AiAnswerValidatedBody = z.infer<typeof aiAnswerSchema>['body'];
export type UpdateAssistantValidatedBody = z.infer<typeof updateAssistantSchema>['body'];
