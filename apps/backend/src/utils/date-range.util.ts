/**
 * Helpers puros de rango de fechas y proporciones para reportes (HU-SAAS-03, HU-REP-01).
 * Viven aquí, y no en una feature, para que un reporte de tenant no importe de `admin-metrics`.
 */

export const DIA_MS = 24 * 60 * 60 * 1000;

/** `hasta` sin hora (medianoche UTC exacta) se interpreta como "hasta el final de ese día". */
export function normalizeHasta(hasta: Date): Date {
  const esMedianoche =
    hasta.getUTCHours() === 0 &&
    hasta.getUTCMinutes() === 0 &&
    hasta.getUTCSeconds() === 0 &&
    hasta.getUTCMilliseconds() === 0;
  return esMedianoche ? new Date(hasta.getTime() + DIA_MS - 1) : hasta;
}

/** Medianoche UTC del día de `fecha`. */
export function inicioDelDiaUtc(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

/** `parte / total` con 4 decimales; 0 si `total` es 0. */
export function ratio(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 10000) / 10000 : 0;
}
