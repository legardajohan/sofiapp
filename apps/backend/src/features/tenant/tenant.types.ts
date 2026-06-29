import type { Types, Document } from 'mongoose';

export type EstadoTenant = 'activo' | 'suspendido' | 'prueba';

export interface ICampoCaptura {
  key: string;
  label: string;
  tipo: 'string' | 'number' | 'enum';
  opciones?: string[];
}

export interface ITenant {
  nombre: string;
  slug: string;
  nit?: string;
  contacto: { email: string; telefono: string };
  estado: EstadoTenant;
  planId?: Types.ObjectId;
  camposCaptura: ICampoCaptura[];
}

export interface ITenantDocument extends ITenant, Document {}

// DTOs para HU-SAAS-01

export interface IAdminUserDTO {
  nombre: string;
  email: string;
  password: string;
}

export interface CreateTenantDTO {
  nombre: string;
  slug: string;
  nit?: string;
  contacto: { email: string; telefono: string };
  planId?: string;
  adminUser?: IAdminUserDTO;
}

export interface UpdateTenantDTO {
  nombre?: string;
  nit?: string;
  contacto?: { email?: string; telefono?: string };
  planId?: string;
}

export interface UpdateTenantStatusDTO {
  estado: 'activo' | 'suspendido';
}

export interface ITenantResponse {
  _id: string;
  nombre: string;
  slug: string;
  nit?: string;
  contacto: { email: string; telefono: string };
  estado: EstadoTenant;
  planId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListTenantsQuery {
  search?: string;
  page: number;
  limit: number;
}

export interface TenantsListResponse {
  data: ITenantResponse[];
  total: number;
  page: number;
  limit: number;
}
