import type { RequestHandler } from 'express';
import { getHandoffSettings, updateHandoffSettings } from './ai-handoff.service.js';
import type { UpdateHandoffSettingsValidatedBody } from './ai-handoff.validation.js';

export const getHandoffSettingsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await getHandoffSettings(tenantId));
};

export const updateHandoffSettingsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const dto = req.body as UpdateHandoffSettingsValidatedBody;
  res.status(200).json(await updateHandoffSettings(tenantId, dto));
};
