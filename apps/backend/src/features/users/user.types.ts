import type { Document, Types } from 'mongoose';

export type UserRol = 'superadmin' | 'admin';

/** Fuente única de los subroles de `admin` (AUTH-02). Zod y Mongoose leen de aquí. */
export const ADMIN_SUBROLES = ['director', 'manager', 'coordinator', 'secretary'] as const;
export type AdminSubrol = (typeof ADMIN_SUBROLES)[number];

export interface IUser {
  tenantId: Types.ObjectId | null;
  nombre: string;
  email: string;
  passwordHash: string;
  rol: UserRol;
  subrol?: AdminSubrol;
  activo: boolean;
}

export interface IUserDocument extends IUser, Document {}

export interface IUserResponse {
  id: string;
  tenantId: string | null;
  nombre: string;
  email: string;
  rol: UserRol;
  subrol?: AdminSubrol;
  activo: boolean;
  /** Presente cuando el documento lo trae (listados de gestión, AUTH-03). */
  createdAt?: string;
}

// ── Gestión de usuarios (AUTH-03) ────────────────────────────────────────────────────────────

/** Alta: `subrol` es obligatorio aquí aunque en Mongo siga opcional (el propietario no lo tiene). */
export interface CreateUserDTO {
  nombre: string;
  email: string;
  password: string;
  subrol: AdminSubrol;
}

export interface UpdateUserDTO {
  nombre?: string;
  email?: string;
  subrol?: AdminSubrol;
}

/** Qué hacer con las conversaciones asignadas al usuario que se desactiva. */
export type MoverConversaciones =
  | { accion: 'reasignar'; destinoId: string }
  | { accion: 'desasignar' };

export interface SetUserEstadoDTO {
  activo: boolean;
  conversaciones?: MoverConversaciones;
}

export interface IManageUsersQuery {
  /** `undefined` = activos e inactivos. */
  activo?: boolean;
  subrol?: AdminSubrol;
  q?: string;
}

/** `code` del 409 que pide decidir qué hacer con las conversaciones antes de desactivar. */
export const USER_HAS_ASSIGNED_CONVERSATIONS = 'USER_HAS_ASSIGNED_CONVERSATIONS';
