import type { Types } from 'mongoose';
import { resolverRolEmpresa } from '../users/user.rol-empresa.js';
import type { RolEmpresa, UserRol } from '../users/user.types.js';

export interface LoginDTO {
  email: string;
  password: string;
}

export interface ISessionUser {
  sub: string;
  nombre: string;
  email: string;
  rol: UserRol;
  rolEmpresa?: RolEmpresa;
  tenantId: string | null;
}

export interface ISessionUserSource {
  _id: Types.ObjectId;
  nombre: string;
  email: string;
  rol: UserRol;
  rolEmpresa?: RolEmpresa;
  /** Solo en documentos aún no migrados (AUTH-02). */
  subrol?: unknown;
  tenantId: Types.ObjectId | null;
}

export function mapUserToSession(user: ISessionUserSource): ISessionUser {
  return {
    sub: user._id.toString(),
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    ...(user.rol === 'admin' ? { rolEmpresa: resolverRolEmpresa(user) } : {}),
    tenantId: user.tenantId ? user.tenantId.toString() : null,
  };
}
