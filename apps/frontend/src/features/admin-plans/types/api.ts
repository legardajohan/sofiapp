import type { IPlanLimites } from './domain.js';

export interface CreatePlanPayload {
  nombre: string;
  limites: IPlanLimites;
  precio: number;
  costoEstimado?: number;
  activo?: boolean;
}

export interface UpdatePlanPayload {
  nombre?: string;
  limites?: Partial<IPlanLimites>;
  precio?: number;
  costoEstimado?: number;
  activo?: boolean;
}
