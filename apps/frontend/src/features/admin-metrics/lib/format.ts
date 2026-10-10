import type { EstadoTenant } from '../../admin-tenants/types/index.js';
import { formatEntero, formatPorcentaje } from '@/lib/format';

// Formato numérico compartido con otros reportes (HU-REP-01); se re-exporta para no tocar imports.
export { formatEntero, formatPorcentaje };

const mesCorto = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' });
const mesLargo = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function fechaDePeriodo(periodo: string): Date {
  const [anio, mes] = periodo.split('-').map(Number);
  return new Date(Date.UTC(anio ?? 1970, (mes ?? 1) - 1, 1));
}

/** `2026-05` → `may`. Eje de la tendencia. */
export function formatMesCorto(periodo: string): string {
  return mesCorto.format(fechaDePeriodo(periodo)).replace('.', '');
}

/** `2026-05` → `mayo de 2026`. Tooltip de la tendencia. */
export function formatMesLargo(periodo: string): string {
  return mesLargo.format(fechaDePeriodo(periodo));
}

export const ESTADO_TENANT_LABEL: Record<EstadoTenant, string> = {
  activo: 'Activa',
  prueba: 'En prueba',
  suspendido: 'Suspendida',
};

/** Orden de lectura de los estados: lo sano primero. */
export const ESTADOS_TENANT: readonly EstadoTenant[] = ['activo', 'prueba', 'suspendido'];
