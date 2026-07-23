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
      // req.query es un getter en Express 5 que siempre re-parsea el query string crudo:
      // mutarlo no persiste entre accesos. Guardamos el resultado ya validado/coercionado
      // aparte; los controllers deben leer `req.validatedQuery`, no `req.query`.
      req.validatedQuery = result.data.query as Record<string, unknown>;
    }
    next();
  });
}
