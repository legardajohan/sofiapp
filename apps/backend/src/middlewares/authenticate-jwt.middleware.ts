import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { isTokenRevoked } from '../features/auth/session.service.js';
import { resolverRolEmpresa } from '../features/users/user.rol-empresa.js';
import type { SafeUser } from '../types/express.js';

/**
 * Autentica por la cookie `token`. Desde AUTH-03 además rechaza los JWT revocados (usuario
 * desactivado, rol cambiado o contraseña restablecida). No consulta `User`: solo la lista de
 * revocación, donde la ausencia de documento significa sesión válida (ADR 0016).
 */
export const authenticateJWT: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.token as string | undefined;
  if (!token) {
    res.status(401).json({ message: 'No autenticado.' });
    return;
  }
  let payload: Record<string, unknown>;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>;
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado.' });
    return;
  }

  const tenantRaw = payload['tenantId'];
  const user: SafeUser = {
    sub: String(payload['sub']),
    tenantId: tenantRaw ? new Types.ObjectId(String(tenantRaw)) : null,
    rol: payload['rol'] as SafeUser['rol'],
  };
  // AUTH-04: un token emitido antes del despliegue trae `subrol` (o nada); se traduce con la misma
  // tabla que la migración, así nadie pierde la sesión ni gana permisos (ADR 0017).
  if (user.rol === 'admin') user.rolEmpresa = resolverRolEmpresa(payload);

  // El superadmin no pertenece a ningún tenant ni se gestiona desde uno: no tiene revocaciones.
  if (user.tenantId) {
    const iat = typeof payload['iat'] === 'number' ? payload['iat'] : undefined;
    if (await isTokenRevoked(user.tenantId, user.sub, iat)) {
      res.status(401).json({ message: 'Sesión revocada.' });
      return;
    }
  }

  req.user = user;
  next();
};
