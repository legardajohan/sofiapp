import { describe, it, expect } from 'vitest';
import { calcularChecksumEvento, checksumsIguales, firmarIntegridad } from './wompi.signature.js';

const BASE = {
  reference: 'SOFI-AAAAAAAAAAAAAAAAAAAAAAAA',
  amountInCents: 11900000,
  currency: 'COP',
  expirationTime: '2026-11-19T20:28:50.000Z',
  integritySecret: 'test_integrity_secretodeprueba',
};

describe('firmarIntegridad', () => {
  it('coincide con el vector del plan', () => {
    expect(firmarIntegridad(BASE)).toBe(
      '4c0eb341acc4a19d56488b7e42fb5b37424b5790709d64202d777823a8722a39',
    );
  });

  it.each([
    ['reference', { reference: 'SOFI-AAAAAAAAAAAAAAAAAAAAAAAB' }],
    ['amountInCents', { amountInCents: 11900001 }],
    ['currency', { currency: 'USD' }],
    ['expirationTime', { expirationTime: '2026-11-19T20:28:51.000Z' }],
    ['integritySecret', { integritySecret: 'test_integrity_secretodepruebb' }],
  ])('cambiar %s cambia la firma', (_n, cambio) => {
    expect(firmarIntegridad({ ...BASE, ...cambio })).not.toBe(firmarIntegridad(BASE));
  });
});

describe('calcularChecksumEvento', () => {
  it('coincide con el vector del plan', () => {
    expect(
      calcularChecksumEvento(
        ['1234-1668624786-37890', 'APPROVED', '11900000'],
        1668624786,
        'test_events_secretodeprueba',
      ),
    ).toBe('303b8490301963ee486c72006652759ea5b6d283070d3f97f3f0a21cf9789674');
  });
});

describe('checksumsIguales', () => {
  it('iguales → true', () => expect(checksumsIguales('abc123', 'abc123')).toBe(true));
  it('distintos → false', () => expect(checksumsIguales('abc123', 'abc124')).toBe(false));
  it('distinta longitud → false sin lanzar', () => {
    expect(() => checksumsIguales('abc', 'abcdef')).not.toThrow();
    expect(checksumsIguales('abc', 'abcdef')).toBe(false);
  });
  it('mayúsculas vs minúsculas → true', () => expect(checksumsIguales('ABC123', 'abc123')).toBe(true));
});
