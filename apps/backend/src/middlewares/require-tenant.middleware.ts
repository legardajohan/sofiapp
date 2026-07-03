<<<<<<< HEAD
import type { Request, Response, NextFunction } from 'express';

export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !req.user.tenantId) {
=======
import type { RequestHandler } from 'express';

export const requireTenant: RequestHandler = (req, res, next) => {
  if (!req.user?.tenantId) {
>>>>>>> develop
    res
      .status(500)
      .json({ message: 'Error interno del servidor: información de usuario corrupta.' });
    return;
  }
  next();
<<<<<<< HEAD
}
=======
};
>>>>>>> develop
