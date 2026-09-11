import type { RequestHandler } from 'express';
import {
  createLeadFromConversation,
  deleteLead,
  getLeadById,
  listLeads,
  updateLeadEstado,
} from './lead.service.js';
import { puedeVerDatosSensibles } from '../../middlewares/authorize-subrol.middleware.js';
import type { ListLeadsQuery } from './lead.types.js';
import type { CreateLeadBody, DeleteLeadQuery, UpdateLeadBody } from './lead.validation.js';

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
  // El `resumen` que pinta la tabla es un dato sensible (HU-IA-04): el permiso se resuelve aquí,
  // no en el service, igual que en la bandeja.
  res.status(200).json(await listLeads(tenantId, query, puedeVerDatosSensibles(req.user!)));
};

export const updateLeadController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const actorId = req.user!.sub;
  const id = req.params['id'] as string;
  const { estado } = req.body as UpdateLeadBody;
  res.status(200).json(await updateLeadEstado(tenantId, actorId, id, estado));
};
