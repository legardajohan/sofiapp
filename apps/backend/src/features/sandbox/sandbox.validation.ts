import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

/** Un mensaje de WhatsApp de texto admite hasta 4096 caracteres. */
export const TEXTO_MAX = 4096;

export const getSessionSchema = z.object({ body: empty, params: empty, query: empty });

export const sendMessageSchema = z.object({
  body: z.object({ texto: z.string().trim().min(1, 'Escribe un mensaje.').max(TEXTO_MAX) }).strict(),
  params: empty,
  query: empty,
});

/** `flowId: null` = volver al flujo activo del tenant. */
export const selectFlowSchema = z.object({
  body: z.object({ flowId: objectId.nullable() }).strict(),
  params: empty,
  query: empty,
});

export const resetSessionSchema = getSessionSchema;
export const advanceWaitSchema = getSessionSchema;

export type SendMessageBody = z.infer<typeof sendMessageSchema>['body'];
export type SelectFlowBody = z.infer<typeof selectFlowSchema>['body'];
