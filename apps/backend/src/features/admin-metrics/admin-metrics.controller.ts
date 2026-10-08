import type { Request, Response } from 'express';
import { getGlobalMetrics } from './admin-metrics.service.js';
import type { GlobalMetricsQueryInput } from './admin-metrics.validation.js';

export async function getGlobalMetricsController(req: Request, res: Response): Promise<void> {
  const result = await getGlobalMetrics(req.validatedQuery as unknown as GlobalMetricsQueryInput);
  res.json(result);
}
