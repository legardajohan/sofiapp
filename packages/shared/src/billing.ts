/**
 * Vocabulario de la pasarela de pagos (HT-PAY-04, ADR 0021). Vive en `shared` porque el frontend
 * de HU-BILL-02 pinta los mismos periodos y estados que valida el backend.
 *
 * No hay periodo `mensual` (D5): el admin solo puede pagar trimestral, semestral o anual.
 */
export const PERIODOS_COBRO = ['trimestral', 'semestral', 'anual'] as const;
export type PeriodoCobro = (typeof PERIODOS_COBRO)[number];

export const MESES_POR_PERIODO_COBRO: Readonly<Record<PeriodoCobro, number>> = {
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

export const ESTADOS_PAGO = [
  'PENDIENTE',
  'APROBADO',
  'RECHAZADO',
  'ANULADO',
  'ERROR',
  'EXPIRADO',
] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];

/** Estados de los que un pago no sale nunca: son inmutables. */
export const ESTADOS_PAGO_TERMINALES = [
  'APROBADO',
  'RECHAZADO',
  'ANULADO',
  'ERROR',
  'EXPIRADO',
] as const;
export type EstadoPagoTerminal = (typeof ESTADOS_PAGO_TERMINALES)[number];

export const ESTADOS_SUSCRIPCION = ['sin_plan', 'activa', 'vencida'] as const;
export type EstadoSuscripcion = (typeof ESTADOS_SUSCRIPCION)[number];

export const ORIGENES_SUSCRIPCION = ['pago', 'manual'] as const;
export type OrigenSuscripcion = (typeof ORIGENES_SUSCRIPCION)[number];
