import type { Request, Response } from 'express';
import {
  listTenants,
  createTenant,
  updateTenant,
  updateTenantStatus,
  assignPlanToTenant,
  deleteTenant,
} from './tenant.service.js';
import { getPrincipal, resetPrincipalPassword } from '../users/user.service.js';
import type {
  ListTenantsQuery,
  CreateTenantInput,
  UpdateTenantInput,
  UpdateTenantStatusInput,
} from './tenant.types.js';

export async function listTenantsController(req: Request, res: Response): Promise<void> {
  const result = await listTenants(req.validatedQuery as unknown as ListTenantsQuery);
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

// AUTH-05 — usuario principal (solo superadmin). El `:id` es el tenant: ruta cross-tenant.
export async function getPrincipalController(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  res.json(await getPrincipal(id));
}

export async function resetPrincipalPasswordController(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { password } = req.body as { password: string };
  await resetPrincipalPassword(id, req.user!.sub, password);
  res.status(204).send();
}

export async function deleteTenantController(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await deleteTenant(id);
  res.status(204).send();
}
