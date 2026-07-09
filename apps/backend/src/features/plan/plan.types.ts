import type { Document } from 'mongoose';
import type { z } from 'zod';
import type { createPlanSchema, updatePlanSchema } from './plan.validation.js';

export interface IPlanLimites {
  usuarios: number; // total acumulado de usuarios del tenant
  mensajesMes: number; // mensajes outbound por periodo (YYYY-MM)
  leads: number; // total acumulado de clientes/leads del tenant
  campanasMes: number; // campañas lanzadas por periodo
}

export interface IPlan {
  nombre: string;
  limites: IPlanLimites;
  precio: number;
  costoEstimado?: number; // para rentabilidad: margen = precio - costoEstimado
  activo: boolean;
}

export interface IPlanDocument extends IPlan, Document {}

export interface IPlanResponse {
  _id: string;
  nombre: string;
  limites: IPlanLimites;
  precio: number;
  costoEstimado?: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

// Zod = fuente única del tipo de entrada
export type CreatePlanDTO = z.infer<typeof createPlanSchema.shape.body>;
export type UpdatePlanDTO = z.infer<typeof updatePlanSchema.shape.body>;
