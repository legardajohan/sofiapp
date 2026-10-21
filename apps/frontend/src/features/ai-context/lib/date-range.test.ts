import { describe, it, expect } from 'vitest';
import { diasLocalesAInstantes, rangoInvertido, SIN_FECHAS } from './date-range.js';

// Los esperados se construyen con `new Date(y, m, d)`: misma zona que la función, sea cual sea la
// del runner. Así el test prueba la regla ("medianoche local", "día siguiente") y no una zona fija.
const local = (y: number, m: number, d: number): string => new Date(y, m - 1, d).toISOString();

describe('diasLocalesAInstantes — HU-REP-05-V2', () => {
  it('sin fechas no envía nada', () => {
    expect(diasLocalesAInstantes(SIN_FECHAS)).toEqual({});
  });

  it('desde es la medianoche local de ese día', () => {
    expect(diasLocalesAInstantes({ desde: '2026-10-01', hasta: '' })).toEqual({ desde: local(2026, 10, 1) });
  });

  it('hasta es la medianoche local del día SIGUIENTE: el día elegido entra completo', () => {
    expect(diasLocalesAInstantes({ desde: '', hasta: '2026-10-03' })).toEqual({ hasta: local(2026, 10, 4) });
  });

  it('con ambas, el mismo día es un rango de 24 h locales', () => {
    expect(diasLocalesAInstantes({ desde: '2026-10-03', hasta: '2026-10-03' })).toEqual({
      desde: local(2026, 10, 3),
      hasta: local(2026, 10, 4),
    });
  });

  it('el fin de mes salta al día 1 del mes siguiente', () => {
    expect(diasLocalesAInstantes({ desde: '', hasta: '2026-10-31' })).toEqual({ hasta: local(2026, 11, 1) });
  });

  it('un rango invertido no se envía', () => {
    expect(diasLocalesAInstantes({ desde: '2026-10-05', hasta: '2026-10-01' })).toEqual({});
  });
});

describe('rangoInvertido', () => {
  it('solo cuando ambas están puestas y desde > hasta', () => {
    expect(rangoInvertido({ desde: '2026-10-05', hasta: '2026-10-01' })).toBe(true);
    expect(rangoInvertido({ desde: '2026-10-01', hasta: '2026-10-01' })).toBe(false);
    expect(rangoInvertido({ desde: '2026-10-05', hasta: '' })).toBe(false);
  });
});
