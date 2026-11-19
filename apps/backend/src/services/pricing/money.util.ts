import { Decimal } from 'decimal.js';
import { AppError } from '../../utils/AppError.js';

// Helpers de dinero con precisión decimal (ver ADR 0005). Capa base compartida: los costos
// individuales NO se redondean aquí; el redondeo comercial se aplica solo a subtotales/totales.

export type Moneda = 'COP' | 'USD';
export type MoneyInput = string | number | Decimal;

export function toDecimal(v: MoneyInput): Decimal {
  return new Decimal(v);
}

export function sumar(...vals: MoneyInput[]): Decimal {
  return vals.reduce<Decimal>((acc, v) => acc.plus(new Decimal(v)), new Decimal(0));
}

export function multiplicar(a: MoneyInput, b: MoneyInput): Decimal {
  return new Decimal(a).times(new Decimal(b));
}

/** Convierte USD → COP: `usd × tasa`. La `tasa` es COP por 1 USD (oficial o efectiva). */
export function convertirUsdACop(usd: MoneyInput, tasaCopPorUsd: MoneyInput): Decimal {
  return new Decimal(usd).times(new Decimal(tasaCopPorUsd));
}

/** Convierte COP → USD: `cop / tasa`. Lanza si la tasa no es positiva (evita dividir por 0). */
export function convertirCopAUsd(cop: MoneyInput, tasaCopPorUsd: MoneyInput): Decimal {
  const tasa = new Decimal(tasaCopPorUsd);
  if (tasa.lte(0)) throw new Error('La tasa de cambio debe ser positiva para convertir COP → USD.');
  return new Decimal(cop).div(tasa);
}

/** Tasa efectiva de costeo: `TRM × (1 + protección/100)`. */
export function tasaEfectiva(trmOficial: MoneyInput, proteccionPct: MoneyInput): Decimal {
  const factor = new Decimal(1).plus(new Decimal(proteccionPct).div(100));
  return new Decimal(trmOficial).times(factor);
}

/** Redondeo comercial a `decimales` (por defecto 2), ROUND_HALF_UP. Solo para subtotales/totales. */
export function redondearComercial(v: Decimal, decimales = 2): Decimal {
  return v.toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP);
}

/** Porcentaje de IVA de los precios de los planes (D3, ya incluido en el precio). */
export const IVA_PCT = '19';

const COP_REGEX = /^\d+(\.\d{1,2})?$/;

/**
 * COP → centavos enteros, sin floats. Es lo que Wompi firma y cobra (`amount_in_cents`).
 * Más estricta con los decimales que ADR 0005 §4: Wompi no admite fracciones de centavo.
 */
export function aCentavos(cop: string): number {
  if (typeof cop !== 'string' || !COP_REGEX.test(cop)) {
    throw new AppError('Importe en COP inválido', 400);
  }
  const centavos = new Decimal(cop).times(100);
  if (centavos.lte(0) || centavos.gt(Number.MAX_SAFE_INTEGER)) {
    throw new AppError('Importe en COP fuera de rango', 400);
  }
  return centavos.toNumber();
}

/**
 * Precio con IVA incluido → base e IVA a 2 decimales. La base se redondea y el IVA es el resto,
 * así que `base + iva === total` siempre, al centavo.
 */
export function desglosarIva(
  totalCop: string,
  ivaPct: string = IVA_PCT,
): { baseCop: string; ivaCop: string } {
  if (!COP_REGEX.test(totalCop)) {
    throw new AppError('Importe en COP inválido', 400);
  }
  const total = new Decimal(totalCop);
  const factor = new Decimal(1).plus(new Decimal(ivaPct).div(100));
  const base = redondearComercial(total.div(factor));
  return { baseCop: base.toFixed(2), ivaCop: total.minus(base).toFixed(2) };
}
