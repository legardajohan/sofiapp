import { Schema, model } from 'mongoose';
import type { IAdminProfileDocument } from './admin-profile.types.js';

// Colección tenant-scoped: cada etiqueta pertenece a un tenant. Se accede SIEMPRE vía *Scoped.
const AdminProfileSchema = new Schema<IAdminProfileDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    nombre: { type: String, required: true, trim: true },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Nombre único POR tenant (dos empresas pueden tener una etiqueta con el mismo nombre).
AdminProfileSchema.index({ tenantId: 1, nombre: 1 }, { unique: true });

export const AdminProfile = model<IAdminProfileDocument>(
  'AdminProfile',
  AdminProfileSchema,
  'admin_profiles',
);
