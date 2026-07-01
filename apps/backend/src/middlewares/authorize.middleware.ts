import type { RequestHandler } from 'express';
import type { SafeUser } from '../types/express.js';

export function authorize(roles: SafeUser['rol'][]): RequestHandler {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      res.status(403).json({ message: 'Acceso denegado.' });
      return;
    }
    next();
  };
}
