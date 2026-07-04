import type { RequestHandler } from 'express';

export const requireTenant: RequestHandler = (req, res, next) => {
  if (!req.user?.tenantId) {
    res
      .status(500)
      .json({ message: 'Error interno del servidor: información de usuario corrupta.' });
    return;
  }
  next();
};
