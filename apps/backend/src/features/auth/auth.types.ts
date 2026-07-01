import type { Types } from 'mongoose';
import type { UserRol } from '../users/user.types.js';

export interface LoginDTO {
  email: string;
  password: string;
}

export interface ISessionUser {
  sub: string;
  nombre: string;
  email: string;
  rol: UserRol;
  tenantId: string | null;
}

export interface ISessionUserSource {
  _id: Types.ObjectId;
  nombre: string;
  email: string;
  rol: UserRol;
  tenantId: Types.ObjectId | null;
}

export function mapUserToSession(user: ISessionUserSource): ISessionUser {
  return {
    sub: user._id.toString(),
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    tenantId: user.tenantId ? user.tenantId.toString() : null,
  };
}
