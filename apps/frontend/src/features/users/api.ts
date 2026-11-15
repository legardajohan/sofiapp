import { apiClient } from '@/api/apiClient';
import type {
  CupoUsuarios,
  DeleteUserPayload,
  CreateUserPayload,
  ManageUsersFilters,
  SetUserEstadoPayload,
  UpdateUserPayload,
  UserDTO,
} from './types.js';

/** Administradores activos del propio tenant (alimenta el selector de asignación de HU-OMNI-02). */
export async function fetchTenantUsers(): Promise<UserDTO[]> {
  const { data } = await apiClient.get<UserDTO[]>('/users');
  return data;
}

/** AUTH-06: los desactivados, solo para filtros (no se puede asignar a ellos). */
export async function fetchTenantUsersInactivos(): Promise<UserDTO[]> {
  const { data } = await apiClient.get<UserDTO[]>('/users', { params: { activo: 'false' } });
  return data;
}

// ── Gestión (AUTH-03/AUTH-04). Administrador, y coordinador sobre su equipo; el backend lo exige.

export async function fetchManageUsers(filters: ManageUsersFilters): Promise<UserDTO[]> {
  const params: Record<string, string> = { activo: filters.activo };
  if (filters.rolEmpresa) params['rolEmpresa'] = filters.rolEmpresa;
  if (filters.coordinadorId) params['coordinadorId'] = filters.coordinadorId;
  if (filters.q) params['q'] = filters.q;
  const { data } = await apiClient.get<UserDTO[]>('/users/manage', { params });
  return data;
}

export async function createUser(payload: CreateUserPayload): Promise<UserDTO> {
  const { data } = await apiClient.post<UserDTO>('/users', payload);
  return data;
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<UserDTO> {
  const { data } = await apiClient.patch<UserDTO>(`/users/${id}`, payload);
  return data;
}

export async function setUserEstado(id: string, payload: SetUserEstadoPayload): Promise<UserDTO> {
  const { data } = await apiClient.patch<UserDTO>(`/users/${id}/estado`, payload);
  return data;
}

export async function resetUserPassword(id: string, password: string): Promise<void> {
  await apiClient.post(`/users/${id}/password`, { password });
}

// ── AUTH-05 ─────────────────────────────────────────────────────────────────────────────────

export async function deleteUser(id: string, payload: DeleteUserPayload): Promise<UserDTO> {
  const { data } = await apiClient.delete<UserDTO>(`/users/${id}`, { data: payload });
  return data;
}

export async function fetchCupoUsuarios(): Promise<CupoUsuarios> {
  const { data } = await apiClient.get<CupoUsuarios>('/users/cupo');
  return data;
}

/** La propia contraseña, siempre con la actual. El backend reemite la cookie de la sesión. */
export async function changeOwnPassword(actual: string, nueva: string): Promise<void> {
  await apiClient.patch('/auth/me/password', { actual, nueva });
}
