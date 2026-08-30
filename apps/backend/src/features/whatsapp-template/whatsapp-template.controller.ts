import type { RequestHandler } from 'express';
import { createTemplate, listTemplates, syncTemplates } from './whatsapp-template.service.js';
import type { CreateTemplateBody, ListTemplatesQuery } from './whatsapp-template.types.js';

export const listTemplatesController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const query = req.validatedQuery as unknown as ListTemplatesQuery;
  const result = await listTemplates(tenantId, query);
  res.status(200).json(result);
};

export const createTemplateController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const dto = req.body as CreateTemplateBody;
  const result = await createTemplate(tenantId, dto);
  res.status(201).json(result);
};

export const syncTemplatesController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const result = await syncTemplates(tenantId);
  res.status(200).json(result);
};
