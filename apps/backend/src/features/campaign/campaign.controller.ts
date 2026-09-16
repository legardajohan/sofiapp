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
  resumeCampaign,
} from './campaign.service.js';
import type {
  CreateCampaignBody,
  ListCampaignsQuery,
  ListRecipientsQuery,
  PreviewSegmentoBody,
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
