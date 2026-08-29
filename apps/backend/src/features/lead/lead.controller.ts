import type { RequestHandler } from 'express';
import {
  createLeadFromConversation,
  deleteLead,
  getLeadById,
  listHistorialSemaforo,
  listLeads,
  updateLeadEstado,
  updateLeadSemaforo,
} from './lead.service.js';
import type { ListLeadsQuery } from './lead.types.js';
import type {
  CreateLeadBody,
  DeleteLeadQuery,
  HistorialSemaforoQuery,
  UpdateLeadBody,
  UpdateLeadSemaforoBody,
} from './lead.validation.js';

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

export const listLeadsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  // `validatedQuery`, no `req.query`: en Express 5 el getter re-parsea el query string crudo y
  // perdería los defaults y las coerciones de Zod (ver `validate.middleware.ts`).
  const query = req.validatedQuery as unknown as ListLeadsQuery;
  res.status(200).json(await listLeads(tenantId, query));
};

export const updateLeadController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const actorId = req.user!.sub;
  const id = req.params['id'] as string;
  const { estado } = req.body as UpdateLeadBody;
  res.status(200).json(await updateLeadEstado(tenantId, actorId, id, estado));
};

export const updateLeadSemaforoController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const actorId = req.user!.sub;
  const id = req.params['id'] as string;
  const { semaforo } = req.body as UpdateLeadSemaforoBody;
  res.status(200).json(await updateLeadSemaforo(tenantId, actorId, id, semaforo));
};

export const historialSemaforoController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  // `validatedQuery`, no `req.query`: en Express 5 el getter re-parsea el query string crudo y
  // perderia los defaults y las coerciones de Zod (ver `validate.middleware.ts`).
  const { page, limit } = req.validatedQuery as unknown as HistorialSemaforoQuery;
  res.status(200).json(await listHistorialSemaforo(tenantId, id, page, limit));
};
