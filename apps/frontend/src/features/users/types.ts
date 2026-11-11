import type { RolEmpresa, UserRol } from '@/stores/authStore';

export interface UserDTO {
  id: string;
  tenantId: string | null;
  nombre: string;
  email: string;
  rol: UserRol;
  rolEmpresa?: RolEmpresa;
  /** Coordinador del asesor (su equipo). `null` en cualquier otro rol o en un asesor sin coordinador. */
  coordinadorId: string | null;
  activo: boolean;
  /** AUTH-05: el usuario que creó el superadmin con la empresa. Nadie del tenant lo gestiona. */
  esPrincipal: boolean;
  /** AUTH-05: Administrador que también gestiona a otros administradores (lo concede el principal). */
  puedeGestionarAdministradores: boolean;
  createdAt?: string;
  /** Solo en la gestión: qué puede hacer quien mira sobre esta persona. Lo calcula el backend. */
  acciones?: AccionesUsuario;
}

export interface AccionesUsuario {
  editar: boolean;
  contrasena: boolean;
  estado: boolean;
  eliminar: boolean;
}

/** Uso de los puestos del plan. `limite: null` = la empresa no tiene plan (sin límite). */
export interface CupoUsuarios {
  usuarios: { usado: number; limite: number | null };
  administradores: { usado: number; limite: number | null };
}

// ── Gestión de usuarios (AUTH-03 / AUTH-04) ──────────────────────────────────────────────────

export type FiltroEstado = 'true' | 'false' | 'todos';

export interface ManageUsersFilters {
  activo: FiltroEstado;
  rolEmpresa?: RolEmpresa;
  /** Id de un coordinador, o `'ninguno'` para los asesores sin coordinador. */
  coordinadorId?: string;
  q?: string;
}

export interface CreateUserPayload {
  nombre: string;
  email: string;
  password: string;
  rolEmpresa: RolEmpresa;
  coordinadorId?: string | null;
  puedeGestionarAdministradores?: boolean;
}

/** Qué hacer con los asesores de un coordinador que se desactiva o deja de serlo. */
export type MoverEquipo =
  | { accion: 'reasignar'; coordinadorDestinoId: string }
  | { accion: 'liberar' };

export interface UpdateUserPayload {
  nombre?: string;
  email?: string;
  rolEmpresa?: RolEmpresa;
  coordinadorId?: string | null;
  puedeGestionarAdministradores?: boolean;
  equipo?: MoverEquipo;
}

export type MoverConversaciones =
  | { accion: 'reasignar'; destinoId: string }
  | { accion: 'desasignar' };

export interface SetUserEstadoPayload {
  activo: boolean;
  conversaciones?: MoverConversaciones;
  equipo?: MoverEquipo;
}

/** Eliminar (borrado lógico, AUTH-05) resuelve lo pendiente igual que la desactivación. */
export type DeleteUserPayload = Omit<SetUserEstadoPayload, 'activo'>;

/**
 * Cuerpo del 409 que pide resolver lo pendiente antes de desactivar o de cambiar el rol de un
 * coordinador: conversaciones asignadas (y flujos que lo nombran) y asesores a su cargo.
 */
export interface DependenciasUsuario {
  code: 'USER_HAS_DEPENDENCIES';
  asignadas: number;
  flujos: number;
  asesores: number;
  message: string;
}
