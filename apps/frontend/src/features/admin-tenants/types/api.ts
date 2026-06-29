import type { ITenant } from './domain.js';

export interface IAdminUserPayload {
  nombre: string;
  email: string;
  password: string;
}

export interface CreateTenantPayload {
  nombre: string;
  slug: string;
  nit?: string;
  contacto: { email: string; telefono: string };
  planId?: string;
  adminUser?: IAdminUserPayload;
}

export interface UpdateTenantPayload {
  nombre?: string;
  nit?: string;
  contacto?: { email?: string; telefono?: string };
  planId?: string;
}

export interface UpdateTenantStatusPayload {
  estado: 'activo' | 'suspendido';
}

export interface TenantsListResponse {
  data: ITenant[];
  total: number;
  page: number;
  limit: number;
}
