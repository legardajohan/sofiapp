import type { RequestHandler } from 'express';
import { getAiResponseContext, listAiResponses } from './ai.service.js';
import type { ListAiResponsesValidatedQuery } from './ai.validation.js';

export const listAiResponsesController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { page, limit, method } = req.validatedQuery as ListAiResponsesValidatedQuery;
  res.status(200).json(await listAiResponses(tenantId, { page, limit, method }));
};

export const getAiResponseContextController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await getAiResponseContext(tenantId, id));
};
