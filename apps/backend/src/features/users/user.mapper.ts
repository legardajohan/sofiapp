import type { Types } from 'mongoose';
import type { AdminSubrol, IUserResponse, UserRol } from './user.types.js';

/** Forma mínima (lean, sin `passwordHash`) necesaria para proyectar un usuario. */
export interface IUserSource {
  _id: Types.ObjectId | string;
  tenantId: Types.ObjectId | string | null;
  nombre: string;
  email: string;
  rol: UserRol;
  subrol?: AdminSubrol;
  activo: boolean;
}

export function toUserResponse(user: IUserSource): IUserResponse {
  return {
    id: String(user._id),
    tenantId: user.tenantId ? String(user.tenantId) : null,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    ...(user.subrol ? { subrol: user.subrol } : {}),
    activo: user.activo,
  };
}
