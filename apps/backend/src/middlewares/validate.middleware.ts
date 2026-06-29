import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

export function validate(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    schema.parse({
      body: req.body,
      params: req.params,
      query: req.query,
    });
    next();
  };
}
