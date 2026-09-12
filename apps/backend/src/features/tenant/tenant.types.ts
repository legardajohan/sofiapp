import type { Document, Types } from 'mongoose';
import { z } from 'zod';
import type { IFotografiaFinanciera } from '../plan/plan.types.js';
import {
  createTenantSchema,
  updateTenantSchema,
  updateTenantStatusSchema,
  updateReminderSchema,
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
  /** Pipeline de leads sembrado (HU-CRM-03). */
  estadosSeeded?: boolean;
  /** Catalogo de semaforizacion comercial sembrado (HU-CRM-04). */
  semaforosSeeded?: boolean;
  /** Contador de cambios de contenido en la KB; invalida la caché exacta de respuestas de IA (HU-KB-03). */
  kbVersion?: number;
  /**
   * Recordatorio de inactividad antes de que expire la ventana de 24 h (HU-FLOW-02). Es una
   * política de la empresa sobre TODAS sus conversaciones, no un paso de un flujo concreto — así
   * también cubre las conversaciones que nunca entraron a un flujo. `activo` arranca en `false`:
   * nadie empieza a enviar mensajes automáticos a sus clientes sin haberlo pedido.
   */
  recordatorio?: IReminderConfig;
}

export interface IReminderConfig {
  activo: boolean;
  /** Minutos de antelación antes de `Cliente.ventana24hExpiraEn` para disparar el recordatorio. */
  antelacionMinutos: number;
  texto?: string;
  templateId?: Types.ObjectId;
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

// DTOs para HU-FLOW-02 — recordatorio de inactividad, configurado por el `admin` de su propio tenant
export interface UpdateReminderDTO {
  activo: boolean;
  antelacionMinutos: number;
  texto: string;
  templateId?: string;
}

export interface IReminderResponse {
  activo: boolean;
  antelacionMinutos: number;
  texto: string;
  templateId: string | null;
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
export type UpdateReminderInput = z.infer<typeof updateReminderSchema.shape.body>;
