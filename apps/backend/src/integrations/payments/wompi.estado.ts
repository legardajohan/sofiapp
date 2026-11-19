import type { EstadoPago } from '@sofiapp/shared';

const MAPA: Readonly<Record<string, EstadoPago>> = {
  PENDING: 'PENDIENTE',
  APPROVED: 'APROBADO',
  DECLINED: 'RECHAZADO',
  VOIDED: 'ANULADO',
  ERROR: 'ERROR',
};

/** Estado de Wompi → `EstadoPago`. Lo no reconocido devuelve `null`: no debe mover ningún pago. */
export function mapearEstadoWompi(estado: string): EstadoPago | null {
  return Object.hasOwn(MAPA, estado) ? (MAPA[estado] ?? null) : null;
}
