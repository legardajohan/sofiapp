<<<<<<< HEAD
import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

export function validate(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    schema.parse({
=======
import type { RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { asyncHandler } from './async-handler.middleware.js';

type InputSchema = z.ZodObject<{
  body: z.ZodTypeAny;
  params: z.ZodTypeAny;
  query: z.ZodTypeAny;
}>;

export function validate(schema: InputSchema): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    const result = schema.safeParse({
>>>>>>> develop
      body: req.body,
      params: req.params,
      query: req.query,
    });
<<<<<<< HEAD
    next();
  };
=======
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ message: 'Error de validación.', errors });
      return;
    }
    req.body = result.data.body;
    next();
  });
>>>>>>> develop
}
