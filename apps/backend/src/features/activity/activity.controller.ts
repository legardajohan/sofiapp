import type { Request, Response } from 'express';
import { registrarLatido } from './activity.service.js';

export async function heartbeatController(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId!.toString();
  await registrarLatido(tenantId, req.user!.sub);
  res.status(204).end();
}
