import type { Request, Response } from 'express';
import { getAjustesTenant, updateAjustesTenant } from './tenant.service.js';
import type { UpdateAjustesTenantDTO } from './tenant.types.js';

/** Ajustes del propio tenant (HU-MARK-07). El tenant sale SIEMPRE del token, nunca de params. */
export async function getAjustesTenantController(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await getAjustesTenant(tenantId));
}

export async function updateAjustesTenantController(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await updateAjustesTenant(tenantId, req.body as UpdateAjustesTenantDTO));
}
