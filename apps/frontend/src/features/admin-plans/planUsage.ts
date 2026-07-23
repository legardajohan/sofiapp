import type { IPlan, IPlanTenantRef } from './types/index.js';

/** Estructura del payload 409 `PLAN_IN_USE` que devuelve el backend. */
export interface IPlanInUseError {
  planName: string;
  tenantCount: number;
  tenants: IPlanTenantRef[];
}

/** `true` si el plan está siendo usado por al menos una empresa activa. */
export function isPlanInUse(plan: IPlan): boolean {
  return plan.uso?.enUso ?? false;
}

/**
 * Texto explicativo del bloqueo (para tooltip/mensaje), con los nombres de las empresas.
 * `undefined` si el plan no está en uso.
 */
export function planLockedReason(plan: IPlan): string | undefined {
  if (!isPlanInUse(plan)) return undefined;
  const uso = plan.uso!;
  const nombres = uso.tenants.map((t) => t.name).join(', ');
  const empresas = nombres ? `: ${nombres}` : '';
  return `No se puede editar ni eliminar el plan ${plan.nombre} porque está siendo utilizado por ${uso.tenantCount} empresa(s)${empresas}.`;
}

/**
 * Devuelve el `message` que envió el backend en un error (axios/similar), o `null` si no hay.
 * Útil como fallback: muestra el motivo real (validación, tope de administradores, etc.) en vez de
 * un texto genérico.
 */
export function extractApiErrorMessage(err: unknown): string | null {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data !== null && typeof data === 'object') {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim() !== '') return message;
  }
  return null;
}

/**
 * Extrae la info de un error 409 `PLAN_IN_USE` de una respuesta de axios (o similar).
 * `null` si el error no corresponde a ese caso.
 */
export function extractPlanInUseError(err: unknown): IPlanInUseError | null {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (
    data !== null &&
    typeof data === 'object' &&
    (data as { code?: unknown }).code === 'PLAN_IN_USE' &&
    typeof (data as { data?: unknown }).data === 'object'
  ) {
    return (data as { data: IPlanInUseError }).data;
  }
  return null;
}
