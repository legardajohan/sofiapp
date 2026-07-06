import { Schema, model } from 'mongoose';
import type { ITenantDocument } from './tenant.types.js';

const CampoCapturaSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    tipo: { type: String, enum: ['string', 'number', 'enum'], required: true },
    opciones: [String],
  },
  { _id: false }
);

const TenantSchema = new Schema<ITenantDocument>(
  {
    nombre: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    nit: { type: String },
    contacto: {
      email: { type: String, required: true },
      telefono: { type: String, required: true },
    },
    estado: {
      type: String,
      enum: ['activo', 'suspendido', 'prueba'],
      default: 'prueba',
      required: true,
    },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan' },
    camposCaptura: { type: [CampoCapturaSchema], default: [] },
  },
  { timestamps: true }
);

export const Tenant = model<ITenantDocument>('Tenant', TenantSchema);
export const TenantModel = Tenant;
