import { Schema, model } from 'mongoose';
import type { IPlanDocument } from './plan.types.js';

// NOTA multi-tenancy: `Plan` es un catálogo GLOBAL (sin `tenantId`), igual que `Tenant`.
// Lo referencian los tenants vía `tenants.planId`. Su gestión es exclusiva del superadmin.

const LimitesSchema = new Schema(
  {
    usuarios: { type: Number, required: true, min: 0 },
    mensajesMes: { type: Number, required: true, min: 0 },
    leads: { type: Number, required: true, min: 0 },
    campanasMes: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const PlanSchema = new Schema<IPlanDocument>(
  {
    nombre: { type: String, required: true, unique: true, trim: true },
    limites: { type: LimitesSchema, required: true },
    precio: { type: Number, required: true, min: 0 },
    costoEstimado: { type: Number, min: 0 },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Plan = model<IPlanDocument>('Plan', PlanSchema);
