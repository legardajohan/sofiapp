import type { RequestHandler } from 'express';
import {
  cancelCampaign,
  createCampaign,
  getCampaign,
  launchCampaign,
  listCampaigns,
  listRecipients,
  pauseCampaign,
  previewSegment,
  rescheduleCampaign,
  resumeCampaign,
  scheduleCampaign,
} from './campaign.service.js';
import { getCampaignMetrics, getCampaignsOverview } from './campaign.metrics.service.js';
import type { IImagenSubida } from './campaign.types.js';
import type {
  CampaignMetricsQuery,
  CampaignsOverviewQuery,
  CreateCampaignBody,
  ListCampaignsQuery,
  ListRecipientsQuery,
  PreviewSegmentoBody,
  RescheduleCampaignBody,
  ScheduleCampaignBody,
} from './campaign.validation.js';

export const previewSegmentController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { filtros } = req.body as PreviewSegmentoBody;
  res.status(200).json(await previewSegment(tenantId, filtros));
};

export const createCampaignController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const actorId = req.user!.sub;
  res.status(201).json(await createCampaign(tenantId, actorId, req.body as CreateCampaignBody));
};

export const listCampaignsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  // Express 5 re-parsea `req.query` en cada acceso, así que lo validado vive en `validatedQuery`.
  const query = req.validatedQuery as ListCampaignsQuery;
  res.status(200).json(await listCampaigns(tenantId, query));
};

export const getCampaignController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await getCampaign(tenantId, id));
};

export const listRecipientsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const query = req.validatedQuery as ListRecipientsQuery;
  res.status(200).json(await listRecipients(tenantId, id, query));
};

export const launchCampaignController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await launchCampaign(tenantId, req.user!.sub, id));
};

export const pauseCampaignController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await pauseCampaign(tenantId, req.user!.sub, id));
};

export const resumeCampaignController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await resumeCampaign(tenantId, req.user!.sub, id));
};

export const cancelCampaignController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await cancelCampaign(tenantId, req.user!.sub, id));
};

/** Archivo de multer → tipo del dominio. El service no conoce Express. */
function imagenDe(file: Express.Multer.File | undefined): IImagenSubida | undefined {
  if (!file) return undefined;
  return { buffer: file.buffer, mimeType: file.mimetype, nombreArchivo: file.originalname };
}

export const scheduleCampaignController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const body = req.body as ScheduleCampaignBody;
  res.status(201).json(await scheduleCampaign(tenantId, req.user!.sub, body, imagenDe(req.file)));
};

export const rescheduleCampaignController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const body = req.body as RescheduleCampaignBody;
  res
    .status(200)
    .json(await rescheduleCampaign(tenantId, req.user!.sub, id, body, imagenDe(req.file)));
};

// ─── Métricas (HU-MARK-04) ──────────────────────────────────────────────────────

export const getCampaignMetricsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const { zona } = req.validatedQuery as CampaignMetricsQuery;
  res.status(200).json(await getCampaignMetrics(tenantId, id, zona));
};

export const getCampaignsOverviewController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const query = req.validatedQuery as CampaignsOverviewQuery;
  res.status(200).json(await getCampaignsOverview(tenantId, query));
};
