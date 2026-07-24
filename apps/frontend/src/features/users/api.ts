import { apiClient } from '@/api/apiClient';
import type { UserDTO } from './types.js';

/** Administradores activos del propio tenant (alimenta el selector de asignación de HU-OMNI-02). */
export async function fetchTenantUsers(): Promise<UserDTO[]> {
  const { data } = await apiClient.get<UserDTO[]>('/api/users');
  return data;
}
