import type { Document, Types } from 'mongoose';
import type { z } from 'zod';
import type {
  createAdminProfileSchema,
  updateAdminProfileSchema,
} from './admin-profile.validation.js';

// Etiqueta de administrador PROPIA de un tenant (creada por el admin de la empresa).
// Colección tenant-scoped: `tenantId` requerido e indexado (regla de aislamiento).
export interface IAdminProfile {
  tenantId: Types.ObjectId;
  nombre: string;
  activo: boolean;
}

export interface IAdminProfileDocument extends IAdminProfile, Document {}

export interface IAdminProfileResponse {
  _id: string;
  nombre: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

// Zod = fuente única del tipo de entrada.
export type CreateAdminProfileDTO = z.infer<typeof createAdminProfileSchema.shape.body>;
export type UpdateAdminProfileDTO = z.infer<typeof updateAdminProfileSchema.shape.body>;
