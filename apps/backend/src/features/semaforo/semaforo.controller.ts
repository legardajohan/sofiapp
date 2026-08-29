import type { RequestHandler } from 'express';
import { createSemaforo, listSemaforos, updateSemaforo } from './semaforo.service.js';
import type { CreateSemaforoBody, UpdateSemaforoBody } from './semaforo.validation.js';

export const listSemaforosController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await listSemaforos(tenantId));
};

export const createSemaforoController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(201).json(await createSemaforo(tenantId, req.body as CreateSemaforoBody));
};

export const updateSemaforoController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await updateSemaforo(tenantId, id, req.body as UpdateSemaforoBody));
};
