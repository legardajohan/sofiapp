import type { RequestHandler } from 'express';
import { getContactHistory } from './cliente.service.js';
import type { HistoryQuery } from './cliente.validation.js';

export const getContactHistoryController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const result = await getContactHistory(tenantId, id, req.query as unknown as HistoryQuery);
  res.status(200).json(result);
};
