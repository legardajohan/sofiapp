import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { findByIdScoped, findOneAndUpdateScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { User } from '../users/user.model.js';
import { notifySessionsRevoked, revokeUserSessions } from './session.service.js';
import { mapUserToSession } from './auth.types.js';
import type { ISessionUser, ISessionUserSource } from './auth.types.js';

const CREDENTIALS_ERROR = 'Credenciales inválidas.';
const BCRYPT_ROUNDS = 10;

interface ILoginResult {
  token: string;
  csrfToken: string;
  session: ISessionUser;
}

export interface IAuthCookies {
  token: string;
  csrfToken: string;
}

type UserWithPassword = ISessionUserSource & {
  passwordHash: string;
  activo: boolean;
  eliminado?: boolean;
};
type UserActivo = ISessionUserSource & { activo: boolean; eliminado?: boolean };

/** Firma el JWT de sesión. `iat` explícito solo tras una revocación (ver `changeOwnPassword`). */
function firmarSesion(session: ISessionUser, iat?: number): string {
  // AUTH-04: el claim es `rolEmpresa` (ya traducido si el documento aún no estaba migrado).
  return jwt.sign(
    {
      sub: session.sub,
      tenantId: session.tenantId,
      rol: session.rol,
      rolEmpresa: session.rolEmpresa,
      ...(iat !== undefined ? { iat } : {}),
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );
}

function nuevoCsrf(): string {
  return randomBytes(32).toString('hex');
}

export async function login(email: string, password: string): Promise<ILoginResult> {
  // Excepción documentada: el login resuelve el tenant por email (ADR 0003), sin repositorio scoped.
  const user = await User.findOne({ email }).select('+passwordHash').lean<UserWithPassword>();

  if (!user || !user.activo || user.eliminado) {
    throw new AppError(CREDENTIALS_ERROR, 401);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(CREDENTIALS_ERROR, 401);
  }

  const session = mapUserToSession(user);
  return { token: firmarSesion(session), csrfToken: nuevoCsrf(), session };
}

export async function getProfile(sub: string): Promise<ISessionUser> {
  const user = await User.findById(sub).lean<UserActivo>();

  if (!user || !user.activo || user.eliminado) {
    throw new AppError(CREDENTIALS_ERROR, 401);
  }

  return mapUserToSession(user);
}

/**
 * AUTH-05: el usuario cambia su propia contraseña con la actual. Revoca **todas** sus sesiones y
 * devuelve un token nuevo para la petición en curso, que sigue autenticada.
 *
 * `isTokenRevoked` compara `iat <= revokedAt` por segundo: un token firmado en el mismo segundo de la
 * revocación nacería revocado, así que el nuevo se fecha en el segundo siguiente.
 */
export async function changeOwnPassword(
  tenantId: string,
  sub: string,
  actual: string,
  nueva: string,
): Promise<IAuthCookies> {
  const user = await findByIdScoped(User, tenantId, sub)
    .select('+passwordHash')
    .lean<UserWithPassword>();
  if (!user || !user.activo || user.eliminado) throw new AppError(CREDENTIALS_ERROR, 401);

  if (!(await bcrypt.compare(actual, user.passwordHash))) {
    throw new AppError('La contraseña actual no es correcta.', 400);
  }

  const passwordHash = await bcrypt.hash(nueva, BCRYPT_ROUNDS);
  const revokedAt = await mongoose.connection.transaction(async (session) => {
    await findOneAndUpdateScoped(User, tenantId, { _id: user._id }, { $set: { passwordHash } }, { session });
    return revokeUserSessions(tenantId, sub, session);
  });

  await recordAuditEvent(tenantId, {
    actorId: sub,
    accion: 'user.password_changed',
    entidad: 'user',
    entidadId: sub,
    antes: {},
    despues: {},
  });
  // Corta los sockets de las demás sesiones; el cliente actual reconecta con la cookie nueva.
  await notifySessionsRevoked(tenantId, sub);

  const iat = Math.floor(revokedAt.getTime() / 1000) + 1;
  return { token: firmarSesion(mapUserToSession(user), iat), csrfToken: nuevoCsrf() };
}
