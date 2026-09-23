import { describe, it, expect } from 'vitest';
import { assertPuedeLanzar, calcularPresupuesto, diasEstimados } from './campaign.pacing.js';

/** Entrada por defecto: tier medio, calidad verde, nada gastado, margen y mínimo de producción. */
function entrada(overrides: Partial<Parameters<typeof calcularPresupuesto>[0]> = {}) {
  return {
    tier: 'TIER_1K' as const,
    calidad: 'GREEN' as const,
    consumido24h: 0,
    margen: 0.8,
    intervaloMinimoMs: 1000,
    ...overrides,
  };
}

describe('HU-MARK-01 — cálculo del presupuesto de envío', () => {
  it('cada tier produce su límite, con el margen de seguridad aplicado', () => {
    expect(calcularPresupuesto(entrada({ tier: 'TIER_50' })).limiteDiario).toBe(40);
    expect(calcularPresupuesto(entrada({ tier: 'TIER_250' })).limiteDiario).toBe(200);
    expect(calcularPresupuesto(entrada({ tier: 'TIER_1K' })).limiteDiario).toBe(800);
    expect(calcularPresupuesto(entrada({ tier: 'TIER_10K' })).limiteDiario).toBe(8000);
    expect(calcularPresupuesto(entrada({ tier: 'TIER_100K' })).limiteDiario).toBe(80_000);
  });

  it('`TIER_UNLIMITED` da un número finito: el intervalo no puede salir NaN ni Infinity', () => {
    const p = calcularPresupuesto(entrada({ tier: 'TIER_UNLIMITED' }));

    expect(Number.isFinite(p.limiteDiario)).toBe(true);
    expect(Number.isFinite(p.intervaloMs)).toBe(true);
    // Con un cupo enorme manda el mínimo de entorno; el techo real lo pone el limiter de BullMQ.
    expect(p.intervaloMs).toBe(1000);
  });

  it('`YELLOW` y `UNKNOWN` reducen el cupo a la mitad; `GREEN` no lo toca', () => {
    expect(calcularPresupuesto(entrada({ calidad: 'GREEN' })).limiteDiario).toBe(800);
    expect(calcularPresupuesto(entrada({ calidad: 'YELLOW' })).limiteDiario).toBe(400);
    // No haber podido sondear a Meta no es motivo para enviar como si el número estuviera perfecto.
    expect(calcularPresupuesto(entrada({ calidad: 'UNKNOWN' })).limiteDiario).toBe(400);
  });

  it('`RED` bloquea: no reduce la cadencia, la impide', () => {
    const p = calcularPresupuesto(entrada({ calidad: 'RED' }));

    expect(p.limiteDiario).toBe(0);
    expect(p.bloqueado).toBe(true);
    expect(p.motivoBloqueo).toMatch(/rojo/i);
    expect(() => assertPuedeLanzar(p)).toThrowError(expect.objectContaining({ statusCode: 409 }));
  });

  it('descuenta lo ya consumido en las 24 h rodantes', () => {
    const p = calcularPresupuesto(entrada({ consumido24h: 300 }));

    expect(p.limiteDiario).toBe(800);
    expect(p.consumido24h).toBe(300);
    expect(p.disponible).toBe(500);
    expect(p.bloqueado).toBe(false);
  });

  it('`disponible` nunca es negativo, y agotar el cupo bloquea con su propio motivo', () => {
    const p = calcularPresupuesto(entrada({ consumido24h: 5000 }));

    expect(p.disponible).toBe(0);
    expect(p.bloqueado).toBe(true);
    expect(p.motivoBloqueo).toMatch(/24 h/i);
    expect(() => assertPuedeLanzar(p)).toThrowError(expect.objectContaining({ statusCode: 409 }));
  });

  it('el intervalo reparte el cupo a lo largo del día, respetando el mínimo de entorno', () => {
    // 800 envíos / 86 400 000 ms = 108 000 ms entre uno y otro.
    expect(calcularPresupuesto(entrada()).intervaloMs).toBe(108_000);

    // Con un cupo grande la división baja del mínimo, y entonces manda el mínimo.
    const holgado = calcularPresupuesto(entrada({ tier: 'TIER_100K', intervaloMinimoMs: 2000 }));
    expect(holgado.intervaloMs).toBe(2000);
  });

  it('un presupuesto sano pasa `assertPuedeLanzar` sin lanzar', () => {
    expect(() => assertPuedeLanzar(calcularPresupuesto(entrada()))).not.toThrow();
  });

  it('`diasEstimados` redondea hacia arriba y tolera un cupo de cero', () => {
    expect(diasEstimados(800, 800)).toBe(1);
    expect(diasEstimados(801, 800)).toBe(2);
    expect(diasEstimados(100, 0)).toBe(0);
  });
});
