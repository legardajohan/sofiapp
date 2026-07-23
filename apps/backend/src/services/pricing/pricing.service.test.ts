import { describe, it, expect } from 'vitest';
import { calcularCosteo, type CosteoInput } from './pricing.service.js';
import { convertirCopAUsd, convertirUsdACop } from './money.util.js';

const base: CosteoInput = {
  administradores: 0,
  costoUnitarioAdmin: { currency: 'COP', valor: '0' },
  costItems: [],
  trmOficial: '3305.38',
  proteccionCambiariaPct: 0,
  utilidadPct: 0,
};

describe('pricing.service — Fase D', () => {
  it('CA-17: subtotal de administradores = cantidad × costo unitario vigente', () => {
    const r = calcularCosteo({
      ...base,
      administradores: 10,
      costoUnitarioAdmin: { currency: 'COP', valor: '8000' },
    });
    expect(r.subtotalAdministradoresCop).toBe('80000'); // 10 × 8.000
    expect(r.costoOperativoCop).toBe('80000');
  });

  it('CA-22/CA-23: costo USD se convierte a COP con la tasa del backend y conserva original/moneda/tasa', () => {
    const r = calcularCosteo({
      ...base,
      trmOficial: '3305.38',
      costItems: [{ concepto: 'Tokens IA', currency: 'USD', unitCostOriginal: '10' }],
    });
    expect(r.costoOperativoCop).toBe('33053.8'); // 10 × 3305.38
    const snap = r.costosUnitarios.find((s) => s.concepto === 'Tokens IA');
    expect(snap?.valorOriginal).toBe('10');
    expect(snap?.currency).toBe('USD');
    expect(snap?.tasaUsada).toBe('3305.38'); // sin protección, efectiva == oficial
    expect(snap?.valorConvertidoCop).toBe('33053.8');
  });

  it('precisión decimal: los sub-centavo NO se redondean antes de sumar (solo el total)', () => {
    const r = calcularCosteo({
      ...base,
      costItems: [
        { concepto: 'token-a', currency: 'COP', unitCostOriginal: '0.004' },
        { concepto: 'token-b', currency: 'COP', unitCostOriginal: '0.004' },
      ],
    });
    // 0.004 + 0.004 = 0.008 → total redondeado a 0.01 (si se redondeara cada uno daría 0.00).
    expect(r.costoOperativoCop).toBe('0.01');
  });

  it('CA-26: protección cambiaria usa tasa efectiva para el costo USD, pero TRM oficial para el precio USD', () => {
    const r = calcularCosteo({
      ...base,
      trmOficial: '3300',
      proteccionCambiariaPct: 5,
      costItems: [{ concepto: 'Infra', currency: 'USD', unitCostOriginal: '10' }],
    });
    expect(r.tasaEfectiva).toBe('3465'); // 3300 × 1.05
    expect(r.costoOperativoCop).toBe('34650'); // 10 × 3465 (efectiva)
    expect(r.precioSugeridoCop).toBe('34650'); // utilidad 0
    expect(r.precioSugeridoUsd).toBe('10.5'); // 34650 / 3300 (oficial, NO 3465 → daría 10)
  });

  it('aplica la utilidad al precio sugerido COP', () => {
    const r = calcularCosteo({
      ...base,
      administradores: 1,
      costoUnitarioAdmin: { currency: 'COP', valor: '100000' },
      utilidadPct: 30,
    });
    expect(r.costoOperativoCop).toBe('100000');
    expect(r.precioSugeridoCop).toBe('130000'); // × 1.30
  });

  it('lanza 422 si no hay una TRM válida (> 0)', () => {
    expect(() => calcularCosteo({ ...base, trmOficial: '0' })).toThrow();
  });

  describe('money.util — conversiones', () => {
    it('USD → COP', () => {
      expect(convertirUsdACop('10', '3305.38').toString()).toBe('33053.8');
    });
    it('COP → USD', () => {
      expect(convertirCopAUsd('33053.80', '3305.38').toString()).toBe('10');
    });
  });
});
