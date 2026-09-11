import type { RequestHandler } from 'express';
import {
  answerQuestion,
  getAssistantConfig,
  updateAssistantConfig,
} from './ai-assistant.service.js';
import type { AiAnswerValidatedBody, UpdateAssistantValidatedBody } from './ai.validation.js';

export const aiAnswerController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { mensaje } = req.body as AiAnswerValidatedBody;
  res.status(200).json(await answerQuestion(tenantId, mensaje));
};

export const getAssistantController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await getAssistantConfig(tenantId));
};

export const updateAssistantController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const dto = req.body as UpdateAssistantValidatedBody;
  res.status(200).json(await updateAssistantConfig(tenantId, dto));
};
