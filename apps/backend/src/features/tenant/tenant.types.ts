import type { Document, Types } from 'mongoose';
import { z } from 'zod';
import type { IFotografiaFinanciera } from '../plan/plan.types.js';
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
  // Precio contratado CONGELADO al asignar el plan (no-retroactividad — CA-24).
  fotografiaFinancieraContratada?: IFotografiaFinanciera;
  planContratadoVersion?: number;
  fechaContratacion?: Date;
}

export interface ITenantDocument extends ITenant, Document {}

// Payload estructurado del error 409 `TENANT_ACTIVE` (data del envelope de error): una empresa
// activa no puede editarse ni eliminarse hasta suspenderla.
export interface ITenantActiveDetails {
  tenantId: string;
  tenantName: string;
  estado: EstadoTenant;
}

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
  // `null` = quitar el plan (empresa sin plan); `undefined` = no modificar el plan actual.
  planId?: string | null;
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
  fotografiaFinancieraContratada?: IFotografiaFinanciera;
  planContratadoVersion?: number;
  fechaContratacion?: string;
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
