import type { Document } from 'mongoose';
import type { z } from 'zod';
import type { PerfilBase } from '../admin-profile/admin-profile.constants.js';
import type { PeriodicidadPlan } from './plan.constants.js';
import type { Moneda } from '../../services/pricing/money.util.js';
import type { createPlanSchema, updatePlanSchema } from './plan.validation.js';

// Snapshot de un costo dentro de la fotografía financiera (conserva original, moneda y tasa usada).
export interface ICostoSnapshot {
  concepto: string;
  currency: Moneda;
  valorOriginal: string;
  tasaUsada?: string;
  valorConvertidoCop: string;
}

// Fotografía financiera: datos usados para el cálculo, congelados por versión del plan.
// Todo el dinero va como string (registro inmutable; no se hace aritmética sobre él).
export interface IFotografiaFinanciera {
  trmOficial: string;
  fechaVigenciaTrm: string;
  proteccionCambiariaPct: number;
  tasaEfectiva: string;
  subtotalAdministradoresCop: string;
  costosUnitarios: ICostoSnapshot[];
  costoOperativoCop: string;
  utilidadPct: number;
  precioSugeridoCop: string;
  precioSugeridoUsd: string;
  precioFinalCop: string;
  precioFinalUsd: string;
}

export interface IPlanLimites {
  usuarios: number; // total acumulado de usuarios del tenant
  administradores: number; // puestos/asientos comerciales incluidos (min 1); métrica de cuota
  mensajesMes: number; // mensajes outbound por periodo (YYYY-MM)
  leads: number; // total acumulado de clientes/leads del tenant
  campanasMes: number; // campañas lanzadas por periodo
}

export interface IPlan {
  nombre: string;
  descripcion?: string; // texto comercial breve (máx. 500)
  // Periodicidad de facturación: obligatoria al crear. `precio` se entiende POR periodo.
  periodicidad: PeriodicidadPlan;
  limites: IPlanLimites;
  // Perfiles BASE globales habilitados en el plan (subconjunto de PERFILES_BASE). Las etiquetas
  // propias de cada tenant (admin_profiles) NO se listan aquí; se combinan en tiempo de uso.
  perfilesPermitidos: PerfilBase[];
  precio: number;
  costoEstimado?: number; // para rentabilidad: margen = precio - costoEstimado
  activo: boolean;
  numeroVersion?: number; // versión del plan (default 1); se incrementa con "nueva versión"
  fotografiaFinanciera?: IFotografiaFinanciera; // snapshot de referencia del superadmin
}

export interface IPlanDocument extends IPlan, Document {}

export interface IPlanResponse {
  _id: string;
  nombre: string;
  descripcion?: string;
  periodicidad: PeriodicidadPlan;
  limites: IPlanLimites;
  perfilesPermitidos: PerfilBase[];
  precio: number;
  costoEstimado?: number;
  activo: boolean;
  numeroVersion: number;
  fotografiaFinanciera?: IFotografiaFinanciera;
  createdAt: string;
  updatedAt: string;
}

// Zod = fuente única del tipo de entrada
export type CreatePlanDTO = z.infer<typeof createPlanSchema.shape.body>;
export type UpdatePlanDTO = z.infer<typeof updatePlanSchema.shape.body>;
