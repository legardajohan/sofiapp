import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { SafeUser } from '../types/express.js';

export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
  const token =
    (req.cookies as Record<string, string> | undefined)?.['jwt'] ??
    req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ message: 'No autenticado.' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as SafeUser & {
      sub: string;
      tenantId: string | null;
    };

    req.user = {
      _id: payload.sub,
      tenantId: payload.tenantId ? (payload.tenantId as unknown as import('mongoose').Types.ObjectId) : null,
      email: payload.email,
      nombre: payload.nombre,
      rol: payload.rol,
      activo: payload.activo,
    };

    next();
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado.' });
  }
}
