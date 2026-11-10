import type { AdminSubrol, UserRol } from '@/stores/authStore';

export interface UserDTO {
  id: string;
  tenantId: string | null;
  nombre: string;
  email: string;
  rol: UserRol;
  subrol?: AdminSubrol;
  activo: boolean;
  createdAt?: string;
}

// ── Gestión de usuarios (AUTH-03) ────────────────────────────────────────────────────────────

export type FiltroEstado = 'true' | 'false' | 'todos';

export interface ManageUsersFilters {
  activo: FiltroEstado;
  subrol?: AdminSubrol;
  q?: string;
}

export interface CreateUserPayload {
  nombre: string;
  email: string;
  password: string;
  subrol: AdminSubrol;
}

export interface UpdateUserPayload {
  nombre?: string;
  email?: string;
  subrol?: AdminSubrol;
}

export type MoverConversaciones =
  | { accion: 'reasignar'; destinoId: string }
  | { accion: 'desasignar' };

export interface SetUserEstadoPayload {
  activo: boolean;
  conversaciones?: MoverConversaciones;
}

/** Cuerpo del 409 que pide decidir qué hacer con las conversaciones antes de desactivar. */
export interface ConversacionesAsignadas {
  code: 'USER_HAS_ASSIGNED_CONVERSATIONS';
  asignadas: number;
  flujos: number;
  message: string;
}
