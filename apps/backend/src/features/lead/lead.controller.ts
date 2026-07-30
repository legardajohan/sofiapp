import type { RequestHandler } from 'express';
import { createLeadFromConversation, deleteLead, getLeadById } from './lead.service.js';
import type { CreateLeadBody, DeleteLeadQuery } from './lead.validation.js';

export const createLeadController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const actorId = req.user!.sub;
  const lead = await createLeadFromConversation(tenantId, actorId, req.body as CreateLeadBody);
  res.status(201).json(lead);
};

export const getLeadController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await getLeadById(tenantId, id));
};

export const deleteLeadController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const actorId = req.user!.sub;
  const id = req.params['id'] as string;
  // `validatedQuery`, no `req.query`: en Express 5 el getter re-parsea el query string crudo y
  // perdería la validación de Zod (ver `validate.middleware.ts`).
  const { motivo } = req.validatedQuery as DeleteLeadQuery;
  await deleteLead(tenantId, actorId, id, motivo);
  res.status(204).send();
};
