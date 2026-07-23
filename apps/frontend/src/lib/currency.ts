export type Currency = 'USD' | 'COP';

// Locale y decimales por moneda (USD en-US con centavos; COP es-CO sin decimales).
const LOCALE: Record<Currency, string> = { USD: 'en-US', COP: 'es-CO' };
const MAX_FRACTION: Record<Currency, number> = { USD: 2, COP: 0 };

/**
 * Formatea un importe con `Intl.NumberFormat`. Devuelve "Sin calcular" ante valores no numéricos
 * (undefined/null/NaN) para no mostrar un $0 engañoso cuando aún no hay dato.
 */
export function formatCurrency(amount: number | null | undefined, currency: Currency): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'Sin calcular';
  return new Intl.NumberFormat(LOCALE[currency], {
    style: 'currency',
    currency,
    maximumFractionDigits: MAX_FRACTION[currency],
  }).format(amount);
}

/** Formatea un conteo entero; "—" si el valor no es numérico. */
export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('es-CO');
}
