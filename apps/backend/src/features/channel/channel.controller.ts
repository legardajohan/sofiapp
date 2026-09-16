import type { RequestHandler } from 'express';
import {
  connectChannel,
  getChannelStatus,
  syncChannelTier,
  updateChannelTier,
} from './channel.service.js';
import type { IChannelConnectDto } from './channel.types.js';
import type { UpdateTierBody } from './channel.validation.js';

export const connectController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const dto = req.body as IChannelConnectDto;
  const result = await connectChannel(tenantId, dto);
  res.status(200).json(result);
};

export const statusController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const result = await getChannelStatus(tenantId);
  res.status(200).json(result);
};

export const syncTierController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await syncChannelTier(tenantId));
};

export const updateTierController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await updateChannelTier(tenantId, req.body as UpdateTierBody));
};
