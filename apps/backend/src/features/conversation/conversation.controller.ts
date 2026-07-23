import type { RequestHandler } from 'express';
import {
  getThread,
  listConversations,
  markRead,
  replyMessage,
  setIaHabilitada,
} from './conversation.service.js';
import type {
  IaBody,
  ListConversationsQuery,
  ReplyBody,
  ThreadQuery,
} from './conversation.validation.js';

export const listConversationsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const asesorId = req.user!.sub;
  const result = await listConversations(
    tenantId,
    asesorId,
    req.validatedQuery as unknown as ListConversationsQuery,
  );
  res.status(200).json(result);
};

export const getThreadController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const result = await getThread(tenantId, id, req.validatedQuery as unknown as ThreadQuery);
  res.status(200).json(result);
};

export const replyController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const { texto } = req.body as ReplyBody;
  const message = await replyMessage(tenantId, id, texto);
  res.status(201).json(message);
};

export const markReadController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const conversation = await markRead(tenantId, id);
  res.status(200).json(conversation);
};

export const setIaController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const { habilitada } = req.body as IaBody;
  const conversation = await setIaHabilitada(tenantId, id, habilitada);
  res.status(200).json(conversation);
};
