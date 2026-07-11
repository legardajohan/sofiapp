import type { Request, Response } from 'express';
import {
  listCostItems,
  createCostItem,
  updateCostItem,
  deleteCostItem,
} from './cost-catalog.service.js';
import type { CreateCostItemDTO, UpdateCostItemDTO } from './cost-catalog.types.js';

export async function listCostItemsController(req: Request, res: Response): Promise<void> {
  const activeRaw = req.query['active'];
  const active = activeRaw === undefined ? undefined : activeRaw === 'true';
  res.json(await listCostItems({ active }));
}

export async function createCostItemController(req: Request, res: Response): Promise<void> {
  res.status(201).json(await createCostItem(req.body as CreateCostItemDTO));
}

export async function updateCostItemController(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  res.json(await updateCostItem(id, req.body as UpdateCostItemDTO));
}

export async function deleteCostItemController(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await deleteCostItem(id);
  res.status(204).send();
}
