import type { Request, Response, NextFunction } from 'express';
import type { SafeUser } from '../types/express.js';

export function authorize(roles: SafeUser['rol'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.rol)) {
      res.status(403).json({ message: 'No autorizado.' });
      return;
    }
    next();
  };
}
