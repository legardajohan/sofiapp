import type { RequestHandler } from 'express';
import { extractContactData, getContactHistory } from './cliente.service.js';
import type { HistoryQuery } from './cliente.validation.js';

export const getContactHistoryController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  // `req.validatedQuery`, no `req.query`: en Express 5 `query` es un getter que re-parsea el string
  // crudo, así que perdería la coerción y los defaults que aplicó Zod (page/limit).
  const result = await getContactHistory(
    tenantId,
    id,
    req.validatedQuery as unknown as HistoryQuery,
  );
  res.status(200).json(result);
};

export const extractContactDataController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const datos = await extractContactData(tenantId, id);
  res.status(200).json(datos);
};
