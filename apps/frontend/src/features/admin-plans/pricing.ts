/** Deriva el precio en COP a partir del precio en USD y la TRM. `undefined` si falta algún dato. */
export function precioEnCop(
  precioUsd: number | undefined,
  copRate: number | null | undefined,
): number | undefined {
  if (typeof precioUsd !== 'number' || !Number.isFinite(precioUsd)) return undefined;
  if (typeof copRate !== 'number' || !Number.isFinite(copRate)) return undefined;
  return precioUsd * copRate;
}

/** Margen en USD = precio − costo estimado. `undefined` si el precio no es un número válido. */
export function margenUsd(precioUsd: number | undefined, costoEstimado: number | undefined): number | undefined {
  if (typeof precioUsd !== 'number' || !Number.isFinite(precioUsd)) return undefined;
  return precioUsd - (costoEstimado ?? 0);
}
