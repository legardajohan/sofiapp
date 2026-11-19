import { describe, it, expect } from 'vitest';
import { mapearEstadoWompi } from './wompi.estado.js';

describe('mapearEstadoWompi', () => {
  it.each([
    ['APPROVED', 'APROBADO'],
    ['DECLINED', 'RECHAZADO'],
    ['VOIDED', 'ANULADO'],
    ['ERROR', 'ERROR'],
    ['PENDING', 'PENDIENTE'],
  ])('%s → %s', (entrada, esperado) => {
    expect(mapearEstadoWompi(entrada)).toBe(esperado);
  });

  it.each(['REFUNDED', '', 'approved', 'constructor', '__proto__'])('%j → null', (entrada) => {
    expect(mapearEstadoWompi(entrada)).toBeNull();
  });
});
