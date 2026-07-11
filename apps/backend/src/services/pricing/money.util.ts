import { Decimal } from 'decimal.js';

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
