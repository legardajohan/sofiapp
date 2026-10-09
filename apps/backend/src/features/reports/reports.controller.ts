import type { Request, Response } from 'express';
import { getAdvisorReport, getHandoffRate, getTopProducts } from './reports.service.js';
import type { AdvisorReportQuery, HandoffRateQuery, TopProductsQuery } from './reports.validation.js';

export async function getAdvisorReportController(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId!.toString();
  const report = await getAdvisorReport(tenantId, req.validatedQuery as unknown as AdvisorReportQuery);
  res.json(report);
}

export async function getHandoffRateController(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId!.toString();
  const report = await getHandoffRate(tenantId, req.validatedQuery as unknown as HandoffRateQuery);
  res.json(report);
}

export async function getTopProductsController(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId!.toString();
  const report = await getTopProducts(tenantId, req.validatedQuery as unknown as TopProductsQuery);
  res.json(report);
}
