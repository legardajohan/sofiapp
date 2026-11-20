import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { esReferenciaValida, generarReferencia } from './payment.reference.js';

describe('generarReferencia', () => {
  it('cumple el formato SOFI-<base32 de 24>', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generarReferencia()).toMatch(/^SOFI-[A-Z2-7]{24}$/);
    }
  });

  it('10 000 referencias son todas distintas', () => {
    const set = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) set.add(generarReferencia());
    expect(set.size).toBe(10_000);
  });

  it('no contiene el tenantId', () => {
    const hex = new Types.ObjectId().toHexString();
    expect(generarReferencia().toLowerCase()).not.toContain(hex);
  });
});

describe('esReferenciaValida', () => {
  it('acepta una generada y rechaza formatos ajenos', () => {
    expect(esReferenciaValida(generarReferencia())).toBe(true);
    expect(esReferenciaValida('sofi-ABCDEFGHIJKLMNOPQRSTUVWX')).toBe(false);
    expect(esReferenciaValida('SOFI-ABC')).toBe(false);
    expect(esReferenciaValida('SOFI-ABCDEFGHIJKLMNOPQRSTUVWXY')).toBe(false);
    expect(esReferenciaValida('REF-ABCDEFGHIJKLMNOPQRSTUVWX')).toBe(false);
    expect(esReferenciaValida('SOFI-1BCDEFGHIJKLMNOPQRSTUVWX')).toBe(false);
    expect(esReferenciaValida('')).toBe(false);
  });
});
