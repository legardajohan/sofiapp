import type { EstadoTenant, ITenant } from './types/index.js';

/** Estructura del payload 409 `TENANT_ACTIVE` que devuelve el backend. */
export interface ITenantActiveError {
  tenantId: string;
  tenantName: string;
  estado: EstadoTenant;
}

/** `true` si la empresa está activa (no se puede editar ni eliminar hasta suspenderla). */
export function isTenantActive(tenant: ITenant): boolean {
  return tenant.estado === 'activo';
}

/**
 * Texto explicativo del bloqueo (para tooltip/mensaje). `undefined` si la empresa no está activa.
 */
export function tenantLockedReason(tenant: ITenant): string | undefined {
  if (!isTenantActive(tenant)) return undefined;
  return `No se puede editar ni eliminar la empresa ${tenant.nombre} porque está activa. Suspéndela primero.`;
}

/**
 * Extrae la info de un error 409 `TENANT_ACTIVE` de una respuesta de axios (o similar).
 * `null` si el error no corresponde a ese caso.
 */
export function extractTenantActiveError(err: unknown): ITenantActiveError | null {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (
    data !== null &&
    typeof data === 'object' &&
    (data as { code?: unknown }).code === 'TENANT_ACTIVE' &&
    typeof (data as { data?: unknown }).data === 'object'
  ) {
    return (data as { data: ITenantActiveError }).data;
  }
  return null;
}
