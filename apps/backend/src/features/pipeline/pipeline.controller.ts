import type { RequestHandler } from 'express';
import { getPipeline } from './pipeline.service.js';
import { puedeVerDatosSensibles } from '../../middlewares/authorize-subrol.middleware.js';
import type { PipelineQuery } from './pipeline.types.js';

export const getPipelineController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  // `validatedQuery`, no `req.query`: en Express 5 el getter re-parsea el query string crudo y
  // perdería los defaults y las coerciones de Zod (ver `validate.middleware.ts`).
  const query = req.validatedQuery as unknown as PipelineQuery;
  // El `resumen` que pinta la tarjeta es un dato sensible (HU-IA-04): las tarjetas comparten
  // proyección con la tabla de leads, así que comparten también el gate. Se resuelve aquí, no en el
  // service, igual que en `/api/leads` y en la bandeja.
  res.status(200).json(await getPipeline(tenantId, query, puedeVerDatosSensibles(req.user!)));
};
