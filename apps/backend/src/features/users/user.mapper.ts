import type { Types } from 'mongoose';
import { resolverRolEmpresa } from './user.rol-empresa.js';
import type { IUserResponse, RolEmpresa, UserRol } from './user.types.js';

/** Forma mínima (lean, sin `passwordHash`) necesaria para proyectar un usuario. */
export interface IUserSource {
  _id: Types.ObjectId | string;
  tenantId: Types.ObjectId | string | null;
  nombre: string;
  email: string;
  rol: UserRol;
  rolEmpresa?: RolEmpresa;
  coordinadorId?: Types.ObjectId | string | null;
  /** Campo de AUTH-02. Solo existe en documentos aún no migrados (`lean` lo devuelve igual). */
  subrol?: unknown;
  activo: boolean;
  esPrincipal?: boolean;
  puedeGestionarAdministradores?: boolean;
  eliminado?: boolean;
  createdAt?: Date;
}

/** Rol de empresa de un documento, con la misma traducción que los tokens viejos. */
export function rolEmpresaDe(user: IUserSource): RolEmpresa | undefined {
  return user.rol === 'admin' ? resolverRolEmpresa(user) : undefined;
}

export function toUserResponse(user: IUserSource): IUserResponse {
  const rolEmpresa = rolEmpresaDe(user);
  return {
    id: String(user._id),
    tenantId: user.tenantId ? String(user.tenantId) : null,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    ...(rolEmpresa ? { rolEmpresa } : {}),
    coordinadorId: user.coordinadorId ? String(user.coordinadorId) : null,
    activo: user.activo,
    esPrincipal: user.esPrincipal === true,
    puedeGestionarAdministradores: user.puedeGestionarAdministradores === true,
    ...(user.createdAt ? { createdAt: user.createdAt.toISOString() } : {}),
  };
}
