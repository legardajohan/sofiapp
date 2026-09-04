import type { RequestHandler } from 'express';
import { createFlow, getFlowById, listFlows, updateFlow } from './flow.service.js';
import { getReminderConfig, updateReminderConfig } from '../tenant/tenant.service.js';
import type { CreateFlowBody, UpdateFlowBody } from './flow.validation.js';
import type { UpdateReminderInput } from '../tenant/tenant.types.js';

export const listFlowsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await listFlows(tenantId));
};

export const createFlowController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const flow = await createFlow(tenantId, req.body as CreateFlowBody);
  res.status(201).json(flow);
};

export const getFlowController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await getFlowById(tenantId, id));
};

export const updateFlowController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const flow = await updateFlow(tenantId, id, req.body as UpdateFlowBody);
  res.status(200).json(flow);
};

// HU-FLOW-02 — recordatorio de inactividad. Vive en el tenant (política sobre todas sus
// conversaciones, ver `tenant.service.ts`), pero se expone aquí porque el admin lo configura
// desde el editor de flujos. `tenantId` nace del token, nunca de params.

export const getReminderController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await getReminderConfig(tenantId));
};

export const updateReminderController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const config = await updateReminderConfig(tenantId, req.body as UpdateReminderInput);
  res.status(200).json(config);
};
