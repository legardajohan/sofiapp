import type { Request, Response } from 'express';
import { getAdvisorReport } from './reports.service.js';
import type { AdvisorReportQuery } from './reports.validation.js';

export async function getAdvisorReportController(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId!.toString();
  const report = await getAdvisorReport(tenantId, req.validatedQuery as unknown as AdvisorReportQuery);
  res.json(report);
}
