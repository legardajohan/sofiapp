import type { Request, Response, NextFunction } from 'express';
import { TenantModel } from '../features/tenant/tenant.model.js';
import type { EstadoTenant } from '../features/tenant/tenant.types.js';

export async function requireActiveTenant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const tenant = await TenantModel.findById(req.user!.tenantId)
    .select('estado')
    .lean<{ estado: EstadoTenant }>();

  if (!tenant || tenant.estado !== 'activo') {
    res.status(403).json({ message: 'La empresa no está activa. Contacte al administrador.' });
    return;
  }
  next();
}
