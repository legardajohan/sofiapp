import { createHash, timingSafeEqual } from 'node:crypto';

export interface EntradaFirma {
  reference: string;
  amountInCents: number;
  currency: string;
  expirationTime: string;
  integritySecret: string;
}

const sha256Hex = (texto: string): string => createHash('sha256').update(texto).digest('hex');

/** Firma de integridad del checkout: SHA256(reference + monto + moneda + expiración + secreto). */
export function firmarIntegridad(i: EntradaFirma): string {
  return sha256Hex(`${i.reference}${i.amountInCents}${i.currency}${i.expirationTime}${i.integritySecret}`);
}

/** Checksum de un evento: SHA256(valores en orden + timestamp + secreto de eventos). */
export function calcularChecksumEvento(
  valores: readonly string[],
  timestamp: number,
  eventsSecret: string,
): string {
  return sha256Hex(`${valores.join('')}${timestamp}${eventsSecret}`);
}

/** Comparación en tiempo constante, sin distinguir mayúsculas; longitudes distintas → `false`. */
export function checksumsIguales(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase());
  const y = Buffer.from(b.toLowerCase());
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}
