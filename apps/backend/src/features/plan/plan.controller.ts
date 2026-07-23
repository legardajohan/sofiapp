import type { Request, Response } from 'express';
import { listPlans, createPlan, updatePlan, nuevaVersionPlan, deletePlan } from './plan.service.js';
import type { CreatePlanDTO, UpdatePlanDTO } from './plan.types.js';

export async function listPlansController(req: Request, res: Response): Promise<void> {
  const { activo } = req.validatedQuery as { activo?: boolean };
  res.json(await listPlans({ activo }));
}

export async function createPlanController(req: Request, res: Response): Promise<void> {
  const plan = await createPlan(req.body as CreatePlanDTO);
  res.status(201).json(plan);
}

export async function updatePlanController(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const plan = await updatePlan(id, req.body as UpdatePlanDTO);
  res.json(plan);
}

export async function nuevaVersionPlanController(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  res.json(await nuevaVersionPlan(id));
}

export async function deletePlanController(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await deletePlan(id);
  res.status(204).send();
}
