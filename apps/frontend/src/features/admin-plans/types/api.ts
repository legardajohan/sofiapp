import type { IPlanLimites, PeriodicidadPlan } from './domain.js';

export interface CreatePlanPayload {
  nombre: string;
  descripcion?: string;
  periodicidad: PeriodicidadPlan; // obligatoria al crear
  limites: IPlanLimites;
  precio: number; // en USD
  costoEstimado?: number; // en USD
  activo?: boolean;
}

export interface UpdatePlanPayload {
  nombre?: string;
  descripcion?: string;
  periodicidad?: PeriodicidadPlan;
  limites?: Partial<IPlanLimites>;
  precio?: number;
  costoEstimado?: number;
  activo?: boolean;
}
