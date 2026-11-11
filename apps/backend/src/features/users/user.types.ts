import type { Document, Types } from 'mongoose';

export type UserRol = 'superadmin' | 'admin';

/**
 * Roles dentro de una empresa (AUTH-04, ADR 0017). Jerarquía: administrador > coordinador > asesor.
 * Fuente única: Zod, Mongoose y el frontend leen de aquí (el frontend tiene su gemelo).
 */
export const ROLES_EMPRESA = ['administrador', 'coordinador', 'asesor'] as const;
export type RolEmpresa = (typeof ROLES_EMPRESA)[number];

/**
 * Subroles de AUTH-02, ya retirados. Solo los leen la migración y la traducción de los JWT que se
 * emitieron antes del despliegue (`user.rol-empresa.ts`).
 */
export const SUBROLES_LEGADOS = ['director', 'manager', 'coordinator', 'secretary'] as const;
export type SubrolLegado = (typeof SUBROLES_LEGADOS)[number];

/** Traducción subrol → rol de empresa. Sin subrol (el propietario) → `administrador`. */
export const MAPEO_SUBROL_LEGADO: Readonly<Record<SubrolLegado, RolEmpresa>> = {
  director: 'administrador',
  manager: 'administrador',
  coordinator: 'coordinador',
  secretary: 'asesor',
};

export interface IUser {
  tenantId: Types.ObjectId | null;
  nombre: string;
  email: string;
  passwordHash: string;
  rol: UserRol;
  /** Obligatorio cuando `rol === 'admin'`. El superadmin no pertenece a ninguna empresa. */
  rolEmpresa?: RolEmpresa;
  /** Coordinador del asesor (su equipo). Solo con `rolEmpresa === 'asesor'`; si no, `null`. */
  coordinadorId: Types.ObjectId | null;
  activo: boolean;
}

export interface IUserDocument extends IUser, Document {}

export interface IUserResponse {
  id: string;
  tenantId: string | null;
  nombre: string;
  email: string;
  rol: UserRol;
  rolEmpresa?: RolEmpresa;
  coordinadorId: string | null;
  activo: boolean;
  /** Presente cuando el documento lo trae (listados de gestión, AUTH-03). */
  createdAt?: string;
}

// ── Gestión de usuarios (AUTH-03 / AUTH-04) ──────────────────────────────────────────────────

/** Qué hacer con las conversaciones asignadas al usuario que se desactiva. */
export type MoverConversaciones =
  | { accion: 'reasignar'; destinoId: string }
  | { accion: 'desasignar' };

/** Qué hacer con los asesores de un coordinador que se desactiva o deja de ser coordinador. */
export type MoverEquipo =
  | { accion: 'reasignar'; coordinadorDestinoId: string }
  | { accion: 'liberar' };

export interface CreateUserDTO {
  nombre: string;
  email: string;
  password: string;
  rolEmpresa: RolEmpresa;
  coordinadorId?: string | null;
}

export interface UpdateUserDTO {
  nombre?: string;
  email?: string;
  rolEmpresa?: RolEmpresa;
  coordinadorId?: string | null;
  equipo?: MoverEquipo;
}

export interface SetUserEstadoDTO {
  activo: boolean;
  conversaciones?: MoverConversaciones;
  equipo?: MoverEquipo;
}

export interface IManageUsersQuery {
  /** `undefined` = activos e inactivos. */
  activo?: boolean;
  rolEmpresa?: RolEmpresa;
  /** Id de un coordinador, o `'ninguno'` para los asesores sin coordinador. */
  coordinadorId?: string;
  q?: string;
}

/** `code` del 409 que pide resolver conversaciones y/o equipo antes de desactivar o degradar. */
export const USER_HAS_DEPENDENCIES = 'USER_HAS_DEPENDENCIES';

export interface IDependenciasUsuario {
  asignadas: number;
  flujos: number;
  asesores: number;
}
