import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { aCentavos, desglosarIva } from './money.util.js';

describe('aCentavos', () => {
  it('convierte COP a centavos enteros sin floats', () => {
    expect(aCentavos('149900.00')).toBe(14990000);
    expect(aCentavos('0.10')).toBe(10);
    expect(aCentavos('1')).toBe(100);
    expect(aCentavos('19.99')).toBe(1999);
  });

  it.each(['1.234', '-5', '0', '0.00', 'abc', '', '1,5'])('rechaza %j con 400', (v) => {
    expect(() => aCentavos(v)).toThrowError(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('desglosarIva', () => {
  it('119000 → base 100000.00 e IVA 19000.00', () => {
    expect(desglosarIva('119000')).toEqual({ baseCop: '100000.00', ivaCop: '19000.00' });
  });

  it.each(['149900', '1', '0.10', '99999.99', '1234567.89', '358000', '714000.50'])(
    'base + iva === total para %s',
    (total) => {
      const { baseCop, ivaCop } = desglosarIva(total);
      expect(new Decimal(baseCop).plus(ivaCop).eq(new Decimal(total))).toBe(true);
    },
  );

  it('rechaza importes inválidos', () => {
    expect(() => desglosarIva('1.234')).toThrowError(expect.objectContaining({ statusCode: 400 }));
  });
});
