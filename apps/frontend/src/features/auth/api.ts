import { apiClient } from '../../api/apiClient.js';
import type { AdminSubrol, UserRol } from '../../stores/authStore.js';

export interface LoginDTO {
  email: string;
  password: string;
}

export interface ISessionUser {
  sub: string;
  nombre: string;
  email: string;
  rol: UserRol;
  subrol?: AdminSubrol;
  tenantId: string | null;
}

export async function login(dto: LoginDTO): Promise<ISessionUser> {
  const { data } = await apiClient.post<ISessionUser>('/auth/login', dto);
  return data;
}

export async function fetchMe(): Promise<ISessionUser> {
  const { data } = await apiClient.get<ISessionUser>('/auth/me');
  return data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}
