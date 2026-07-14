import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { User } from '../users/user.model.js';
import { mapUserToSession } from './auth.types.js';
import type { ISessionUser, ISessionUserSource } from './auth.types.js';

const CREDENTIALS_ERROR = 'Credenciales inválidas.';

interface ILoginResult {
  token: string;
  csrfToken: string;
  session: ISessionUser;
}

type UserWithPassword = ISessionUserSource & { passwordHash: string; activo: boolean };
type UserActivo = ISessionUserSource & { activo: boolean };

export async function login(email: string, password: string): Promise<ILoginResult> {
  const user = await User.findOne({ email }).select('+passwordHash').lean<UserWithPassword>();

  if (!user || !user.activo) {
    throw new AppError(CREDENTIALS_ERROR, 401);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(CREDENTIALS_ERROR, 401);
  }

  const tenantId = user.tenantId ? user.tenantId.toString() : null;
  const token = jwt.sign(
    { sub: user._id.toString(), tenantId, rol: user.rol, subrol: user.subrol },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );
  const csrfToken = randomBytes(32).toString('hex');

  return { token, csrfToken, session: mapUserToSession(user) };
}

export async function getProfile(sub: string): Promise<ISessionUser> {
  const user = await User.findById(sub).lean<UserActivo>();

  if (!user || !user.activo) {
    throw new AppError(CREDENTIALS_ERROR, 401);
  }

  return mapUserToSession(user);
}
