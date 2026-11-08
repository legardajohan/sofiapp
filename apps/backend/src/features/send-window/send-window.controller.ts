import type { RequestHandler } from 'express';
import {
  getSendWindowConfig,
  getSendWindowStatus,
  previewHolidays,
  updateSendWindowConfig,
} from './send-window.service.js';
import type { HolidaysPreviewBody, UpdateSendWindowBody } from './send-window.validation.js';

export const getSendWindowController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await getSendWindowConfig(tenantId));
};

export const updateSendWindowController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const actorId = req.user!.sub;
  res.status(200).json(await updateSendWindowConfig(tenantId, actorId, req.body as UpdateSendWindowBody));
};

export const getSendWindowStatusController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await getSendWindowStatus(tenantId));
};

export const previewHolidaysController: RequestHandler = (req, res) => {
  const { anio } = req.body as HolidaysPreviewBody;
  res.status(200).json(previewHolidays(anio));
};
