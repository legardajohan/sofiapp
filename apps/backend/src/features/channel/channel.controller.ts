import type { RequestHandler } from 'express';
import { connectChannel, getChannelStatus } from './channel.service.js';
import type { IChannelConnectDto } from './channel.types.js';

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
