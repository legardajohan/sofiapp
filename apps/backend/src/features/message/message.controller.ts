import type { RequestHandler } from 'express';
import { sendMessage } from './message.service.js';
import type { ISendMessageDto } from './message.types.js';

export const sendController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const dto = req.body as ISendMessageDto;
  const message = await sendMessage(tenantId, dto);
  res.status(200).json({ id: message._id, status: message.status });
};
