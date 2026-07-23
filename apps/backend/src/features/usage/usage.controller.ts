import type { Request, Response } from 'express';
import { getTenantUsage } from './usage.service.js';

export async function getTenantUsageController(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  res.json(await getTenantUsage(id));
}
