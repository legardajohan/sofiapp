import type { IPlanLimites } from './domain.js';

export interface CreatePlanPayload {
  nombre: string;
  descripcion?: string;
  limites: IPlanLimites;
  precio: number; // en USD
  costoEstimado?: number; // en USD
  activo?: boolean;
}

export interface UpdatePlanPayload {
  nombre?: string;
  descripcion?: string;
  limites?: Partial<IPlanLimites>;
  precio?: number;
  costoEstimado?: number;
  activo?: boolean;
}
