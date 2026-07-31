import type { RequestHandler } from 'express';
import { createFaq, deleteFaq, listFaqs, testFaq, updateFaq } from './kb-faq.service.js';
import type { CreateFaqDTO, TestFaqDTO, UpdateFaqDTO } from './kb-faq.types.js';

export const listFaqsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { page, limit, activo } = req.validatedQuery as unknown as {
    page: number;
    limit: number;
    activo?: boolean;
  };
  const result = await listFaqs(tenantId, page, limit, activo);
  res.status(200).json(result);
};

export const createFaqController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const dto = req.body as CreateFaqDTO;
  const result = await createFaq(tenantId, dto);
  res.status(201).json(result);
};

export const updateFaqController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { id } = req.params as { id: string };
  const dto = req.body as UpdateFaqDTO;
  const result = await updateFaq(tenantId, id, dto);
  res.status(200).json(result);
};

export const deleteFaqController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { id } = req.params as { id: string };
  const result = await deleteFaq(tenantId, id);
  res.status(200).json(result);
};

export const testFaqController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { pregunta } = req.body as TestFaqDTO;
  const result = await testFaq(tenantId, pregunta);
  res.status(200).json(result);
};
