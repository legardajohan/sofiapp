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
  /** Usuario principal (AUTH-05): el que crea el superadmin al dar de alta la empresa. Uno por tenant. */
  esPrincipal: boolean;
  /** Administrador no principal que puede gestionar a otros administradores. Lo concede el principal. */
  puedeGestionarAdministradores: boolean;
  /** Borrado lógico (AUTH-05). Un eliminado siempre está además inactivo. */
  eliminado: boolean;
  eliminadoEn?: Date;
  eliminadoPor?: Types.ObjectId;
  /** Email antes de reescribirlo al eliminar (libera el original, ADR 0003). */
  emailOriginal?: string;
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
  esPrincipal: boolean;
  puedeGestionarAdministradores: boolean;
  /** Presente cuando el documento lo trae (listados de gestión, AUTH-03). */
  createdAt?: string;
  /** Solo en `GET /manage` y `GET /:id`: lo que el actor puede hacer sobre este usuario (AUTH-05). */
  acciones?: IAccionesUsuario;
}

/** Acciones de gestión que el actor puede ejecutar sobre un usuario (AUTH-05, `user.permisos.ts`). */
export interface IAccionesUsuario {
  editar: boolean;
  contrasena: boolean;
  estado: boolean;
  eliminar: boolean;
}

/**
 * Actor de gestión: rol del token + flags leídos de BD en cada petición (`cargarActor`). El permiso
 * y la marca de principal no viajan en el JWT para que retirarlos tenga efecto inmediato.
 */
export interface IActorGestion {
  sub: string;
  rolEmpresa: RolEmpresa;
  esPrincipal: boolean;
  puedeGestionarAdministradores: boolean;
}

export interface ICupoMetrica {
  usado: number;
  /** `null` si el tenant no tiene plan (sin límite). */
  limite: number | null;
}

/** Uso de los límites de usuarios del plan (AUTH-05, `GET /api/users/cupo`). */
export interface ICupoUsuarios {
  usuarios: ICupoMetrica;
  administradores: ICupoMetrica;
}

/** Datos del usuario principal que ve el superadmin (AUTH-05). */
export interface IPrincipalResponse {
  id: string;
  nombre: string;
  email: string;
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
  puedeGestionarAdministradores?: boolean;
}

export interface UpdateUserDTO {
  nombre?: string;
  email?: string;
  rolEmpresa?: RolEmpresa;
  coordinadorId?: string | null;
  puedeGestionarAdministradores?: boolean;
  equipo?: MoverEquipo;
}

/** Qué hacer con lo pendiente del usuario que se elimina (mismas opciones que al desactivar). */
export interface DeleteUserDTO {
  conversaciones?: MoverConversaciones;
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
