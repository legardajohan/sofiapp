import { apiClient } from './apiClient.js';
import type {
  CreateTenantPayload,
  UpdateTenantPayload,
  TenantsListResponse,
  ITenant,
} from '../features/admin-tenants/types/index.js';

export const getAdminTenants = async (params: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<TenantsListResponse> => {
  const res = await apiClient.get<TenantsListResponse>('/admin/tenants', { params });
  return res.data;
};

export const createAdminTenant = async (payload: CreateTenantPayload): Promise<ITenant> => {
  const res = await apiClient.post<ITenant>('/admin/tenants', payload);
  return res.data;
};

export const updateAdminTenant = async (
  id: string,
  payload: UpdateTenantPayload
): Promise<ITenant> => {
  const res = await apiClient.patch<ITenant>(`/admin/tenants/${id}`, payload);
  return res.data;
};

export const updateAdminTenantStatus = async (
  id: string,
  estado: 'activo' | 'suspendido'
): Promise<ITenant> => {
  const res = await apiClient.patch<ITenant>(`/admin/tenants/${id}/status`, { estado });
  return res.data;
};
