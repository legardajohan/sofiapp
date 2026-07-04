import type { Document, Types } from 'mongoose';
import { z } from 'zod';
import {
  createTenantSchema,
  updateTenantSchema,
  updateTenantStatusSchema,
} from './tenant.validation.js';

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

// Tipos Zod-inferidos para validación de entrada (fuente única de verdad)
export type CreateTenantInput = z.infer<typeof createTenantSchema.shape.body>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema.shape.body>;
export type UpdateTenantStatusInput = z.infer<typeof updateTenantStatusSchema.shape.body>;
