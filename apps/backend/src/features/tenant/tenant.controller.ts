import type { Request, Response } from 'express';
import {
  listTenants,
  createTenant,
  updateTenant,
  updateTenantStatus,
  assignPlanToTenant,
} from './tenant.service.js';
import type { ListTenantsQuery, CreateTenantInput, UpdateTenantInput, UpdateTenantStatusInput } from './tenant.types.js';

export async function listTenantsController(req: Request, res: Response): Promise<void> {
  const query: ListTenantsQuery = {
    search: req.query['search'] as string | undefined,
    page: Number(req.query['page'] ?? 1),
    limit: Number(req.query['limit'] ?? 20),
  };
  const result = await listTenants(query);
  res.json(result);
}

export async function createTenantController(req: Request, res: Response): Promise<void> {
  const tenant = await createTenant(req.body as CreateTenantInput);
  res.status(201).json(tenant);
}

export async function updateTenantController(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const tenant = await updateTenant(id, req.body as UpdateTenantInput);
  res.json(tenant);
}

export async function updateTenantStatusController(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const tenant = await updateTenantStatus(id, req.body as UpdateTenantStatusInput);
  res.json(tenant);
}

export async function assignPlanToTenantController(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { planId } = req.body as { planId: string };
  const tenant = await assignPlanToTenant(id, planId);
  res.json(tenant);
}
