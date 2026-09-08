import type { RequestHandler } from 'express';
import { getPipeline } from './pipeline.service.js';
import type { PipelineQuery } from './pipeline.types.js';

export const getPipelineController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  // `validatedQuery`, no `req.query`: en Express 5 el getter re-parsea el query string crudo y
  // perdería los defaults y las coerciones de Zod (ver `validate.middleware.ts`).
  const query = req.validatedQuery as unknown as PipelineQuery;
  res.status(200).json(await getPipeline(tenantId, query));
};
