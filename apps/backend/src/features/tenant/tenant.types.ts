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
  /**
   * Marca que las etiquetas de semaforización ya se sembraron en este tenant. Existe para que el
   * backfill de arranque no vuelva a crearlas: desde HU-OMNI-04 el administrador puede borrarlas,
   * y sin esta marca el `upsert` las resucitaría en el siguiente despliegue.
   */
  semaforoTagsSeeded?: boolean;
  /**
   * Lo mismo para los catálogos de interés / objeción / rol de la ficha del contacto (HU-CRM-02):
   * distingue "este tenant nunca los tuvo" de "el administrador borró esa opción a propósito".
   */
  opcionesContactoSeeded?: boolean;
  /** Contador de cambios de contenido en la KB; invalida la caché exacta de respuestas de IA (HU-KB-03). */
  kbVersion?: number;
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
