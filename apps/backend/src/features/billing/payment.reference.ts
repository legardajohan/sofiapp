import { randomBytes } from 'node:crypto';
import { REFERENCIA_REGEX } from './billing.validation.js';

export const PREFIJO_REFERENCIA = 'SOFI-';

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** 15 bytes = 120 bits = exactamente 24 caracteres base32, sin padding. */
const BYTES_REFERENCIA = 15;

function aBase32(bytes: Buffer): string {
  let bits = 0;
  let acumulado = 0;
  let salida = '';
  for (const byte of bytes) {
    acumulado = (acumulado << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO_BASE32[(acumulado >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acumulado &= (1 << bits) - 1;
  }
  return salida;
}

/**
 * Referencia opaca y aleatoria del intento de pago (D8). No incluye el `tenantId` ni nada derivable
 * de él: el tenant se resuelve buscando el pago por su referencia (ADR 0022).
 */
export function generarReferencia(): string {
  return `${PREFIJO_REFERENCIA}${aBase32(randomBytes(BYTES_REFERENCIA))}`;
}

export function esReferenciaValida(valor: string): boolean {
  return typeof valor === 'string' && REFERENCIA_REGEX.test(valor);
}
