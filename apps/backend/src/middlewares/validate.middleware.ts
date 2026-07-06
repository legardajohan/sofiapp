import type { RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { asyncHandler } from './async-handler.middleware.js';

type InputSchema = z.ZodType<Partial<{
  body: unknown;
  params: unknown;
  query: unknown;
}>>;

export function validate(schema: InputSchema): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ message: 'Error de validación.', errors });
      return;
    }
    if (result.data.body !== undefined) req.body = result.data.body as typeof req.body;
    if (result.data.params !== undefined) req.params = result.data.params as typeof req.params;
    if (result.data.query !== undefined) {
      // req.query es un getter en Express 5 (no se puede reasignar): se muta en el mismo objeto.
      for (const key of Object.keys(req.query)) delete (req.query as Record<string, unknown>)[key];
      Object.assign(req.query, result.data.query);
    }
    next();
  });
}
