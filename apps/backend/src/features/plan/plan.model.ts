import { Schema, model } from 'mongoose';
import { PERFILES_BASE } from '../admin-profile/admin-profile.constants.js';
import { PERIODICIDADES_PLAN, PERIODICIDAD_PLAN_DEFAULT } from './plan.constants.js';
import type { IPlanDocument } from './plan.types.js';

// NOTA multi-tenancy: `Plan` es un catálogo GLOBAL (sin `tenantId`), igual que `Tenant`.
// Lo referencian los tenants vía `tenants.planId`. Su gestión es exclusiva del superadmin.

const LimitesSchema = new Schema(
  {
    usuarios: { type: Number, required: true, min: 0 },
    administradores: { type: Number, required: true, min: 1 },
    mensajesMes: { type: Number, required: true, min: 0 },
    leads: { type: Number, required: true, min: 0 },
    campanasMes: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

// Snapshot financiero (dinero como string: registro inmutable). Reutilizado por `tenant` para
// congelar el precio contratado (no-retroactividad, ADR 0005 / CA-24).
const CostoSnapshotSchema = new Schema(
  {
    concepto: { type: String, required: true },
    currency: { type: String, enum: ['COP', 'USD'], required: true },
    valorOriginal: { type: String, required: true },
    tasaUsada: { type: String },
    valorConvertidoCop: { type: String, required: true },
  },
  { _id: false },
);

export const FotografiaFinancieraSchema = new Schema(
  {
    trmOficial: { type: String, required: true },
    fechaVigenciaTrm: { type: String, required: true },
    proteccionCambiariaPct: { type: Number, required: true },
    tasaEfectiva: { type: String, required: true },
    subtotalAdministradoresCop: { type: String, required: true },
    costosUnitarios: { type: [CostoSnapshotSchema], default: [] },
    costoOperativoCop: { type: String, required: true },
    utilidadPct: { type: Number, required: true },
    precioSugeridoCop: { type: String, required: true },
    precioSugeridoUsd: { type: String, required: true },
    precioFinalCop: { type: String, required: true },
    precioFinalUsd: { type: String, required: true },
  },
  { _id: false },
);

const PlanSchema = new Schema<IPlanDocument>(
  {
    // El nombre NO es único por sí solo: puede repetirse si la periodicidad difiere. La unicidad
    // real es la combinación (nombre, periodicidad) — ver el índice compuesto más abajo.
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true, maxlength: 500 },
    periodicidad: {
      type: String,
      enum: PERIODICIDADES_PLAN,
      required: true,
      default: PERIODICIDAD_PLAN_DEFAULT,
    },
    limites: { type: LimitesSchema, required: true },
    perfilesPermitidos: { type: [String], enum: [...PERFILES_BASE], default: [] },
    precio: { type: Number, required: true, min: 0 },
    costoEstimado: { type: Number, min: 0 },
    activo: { type: Boolean, default: true },
    numeroVersion: { type: Number, required: true, default: 1, min: 1 },
    fotografiaFinanciera: { type: FotografiaFinancieraSchema },
  },
  { timestamps: true },
);

// Unicidad por (nombre + periodicidad): permite un mismo nombre en periodicidades distintas
// (p. ej. "Pro" mensual y "Pro" anual), pero no dos planes idénticos en nombre y periodicidad.
// NOTA de migración: reemplaza el índice único previo sobre `nombre`. En una base existente hay que
// eliminar el índice viejo `nombre_1` (ver `scripts/fix-plan-indexes.ts`).
PlanSchema.index({ nombre: 1, periodicidad: 1 }, { unique: true });

export const Plan = model<IPlanDocument>('Plan', PlanSchema);
