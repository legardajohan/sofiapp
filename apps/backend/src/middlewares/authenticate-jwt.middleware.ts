import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import type { SafeUser } from '../types/express.js';

export const authenticateJWT: RequestHandler = (req, res, next) => {
  const token = req.cookies?.token as string | undefined;
  if (!token) {
    res.status(401).json({ message: 'No autenticado.' });
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>;
    const tenantRaw = payload['tenantId'];
    const user: SafeUser = {
      sub: String(payload['sub']),
      tenantId: tenantRaw ? new Types.ObjectId(String(tenantRaw)) : null,
      rol: payload['rol'] as SafeUser['rol'],
      subrol: payload['subrol'] as SafeUser['subrol'],
    };
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado.' });
  }
};
