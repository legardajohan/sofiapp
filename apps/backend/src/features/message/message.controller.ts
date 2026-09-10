import type { RequestHandler } from 'express';
import { sendMessage, sendOutbound } from './message.service.js';
import type { ISendMessageDto, ISendTemplateDto } from './message.types.js';

export const sendController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const dto = req.body as ISendMessageDto;
  const message = await sendMessage(tenantId, dto);
  res.status(200).json({ id: message._id, status: message.status });
};

export const sendTemplateController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { clienteId, templateId, parametros } = req.body as ISendTemplateDto;
  const message = await sendOutbound(tenantId, clienteId, {
    modo: 'plantilla',
    templateId,
    parametros,
  });
  res.status(200).json({ id: message._id, status: message.status });
};
