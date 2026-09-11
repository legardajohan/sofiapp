import { describe, it, expect } from 'vitest';
import {
  evaluarSenales,
  overlapLexico,
  tokensSignificativos,
  type UmbralesFaqMatch,
} from './kb-faq.matching.js';

// Módulo puro: sin mocks, sin Mongo, sin Gemini. Es justo lo que lo hace testeable a este nivel.

const UMBRALES: UmbralesFaqMatch = { umbral: 0.85, margenMinimo: 0.02, overlapMinimo: 0.2 };

const candidato = (pregunta: string, score: number) => ({ pregunta, score });

// ─── tokensSignificativos ─────────────────────────────────────────────────────
describe('tokensSignificativos', () => {
  it('quita tildes, palabras vacías y tokens de menos de 3 caracteres', () => {
    expect(tokensSignificativos('¿Cuál es el precio de la asesoría?')).toEqual([
      'precio',
      'asesoria',
    ]);
  });

  it('descarta signos y separadores, no solo espacios', () => {
    expect(tokensSignificativos('horario/atención (sábados)')).toEqual([
      'horario',
      'atencion',
      'sabados',
    ]);
  });

  it('un texto sin palabras con carga semántica queda vacío', () => {
    expect(tokensSignificativos('¿y eso?')).toEqual([]);
  });
});

// ─── overlapLexico ────────────────────────────────────────────────────────────
describe('overlapLexico', () => {
  it('EL CASO RAÍZ: horarios y precios no comparten ninguna palabra clave', () => {
    expect(overlapLexico('¿a qué hora abren?', '¿Cuál es el precio del curso?')).toBe(0);
  });

  it('tolera el plural: "precios" y "precio" son la misma palabra', () => {
    expect(overlapLexico('¿cuáles son los precios?', '¿Cuál es el precio?')).toBe(1);
  });

  it('tolera el plural en -es: "meses" y "mes"', () => {
    expect(overlapLexico('¿cuántos meses dura?', '¿El mes se paga adelantado?')).toBeGreaterThan(0);
  });

  it('tolera el prefijo: "hora" coincide con "horario"', () => {
    expect(overlapLexico('¿a qué hora abren?', '¿Cuál es el horario de atención?')).toBeGreaterThan(
      0,
    );
  });

  it('no coincide por prefijos ajenos: "casa" no es "costo"', () => {
    expect(overlapLexico('¿tienen casa propia?', '¿Cuál es el costo?')).toBe(0);
  });

  it('queda acotado a [0,1] aunque una pregunta sea mucho más larga que la otra', () => {
    const corta = '¿precio?';
    const larga = '¿Cuál es el precio, el precio final y el precio con descuento del curso?';

    const valor = overlapLexico(corta, larga);
    expect(valor).toBeGreaterThan(0);
    expect(valor).toBeLessThanOrEqual(1);
  });

  it('es simétrico', () => {
    const a = '¿cuánto cuesta el curso?';
    const b = '¿Cuál es el costo del curso?';
    expect(overlapLexico(a, b)).toBe(overlapLexico(b, a));
  });

  it('sin tokens significativos devuelve 0 y no lanza', () => {
    expect(overlapLexico('¿y eso?', '¿Cuál es el precio?')).toBe(0);
    expect(overlapLexico('', '')).toBe(0);
  });
});

// ─── evaluarSenales ───────────────────────────────────────────────────────────
describe('evaluarSenales', () => {
  it('sin segundo candidato el margen es el score entero y la señal pasa', () => {
    // Un tenant con una sola FAQ activa no tiene ambigüedad que medir: bloquearlo dejaría
    // el feature inútil justo al arrancar.
    const senales = evaluarSenales(
      '¿cuál es el precio?',
      candidato('¿Cuál es el precio del curso?', 0.9),
      undefined,
      UMBRALES,
    );

    expect(senales.segundoScore).toBeUndefined();
    expect(senales.margen).toBe(0.9);
    expect(senales.pasaMargen).toBe(true);
    expect(senales.aprobado).toBe(true);
  });

  it('empate exacto con el segundo → el margen no pasa y no se aprueba', () => {
    const senales = evaluarSenales(
      '¿cuál es el precio?',
      candidato('¿Cuál es el precio del curso?', 0.9),
      0.9,
      UMBRALES,
    );

    expect(senales.margen).toBe(0);
    expect(senales.pasaMargen).toBe(false);
    expect(senales.aprobado).toBe(false);
  });

  it('score bajo el umbral no se aprueba aunque margen y overlap sobren', () => {
    const senales = evaluarSenales(
      '¿cuál es el precio?',
      candidato('¿Cuál es el precio del curso?', 0.5),
      0.1,
      UMBRALES,
    );

    expect(senales.pasaUmbral).toBe(false);
    expect(senales.pasaMargen).toBe(true);
    expect(senales.pasaOverlap).toBe(true);
    expect(senales.aprobado).toBe(false);
  });

  it('overlap cero no se aprueba aunque score y margen sobren', () => {
    const senales = evaluarSenales(
      '¿a qué hora abren?',
      candidato('¿Cuál es el precio del curso?', 0.95),
      0.5,
      UMBRALES,
    );

    expect(senales.pasaUmbral).toBe(true);
    expect(senales.pasaMargen).toBe(true);
    expect(senales.pasaOverlap).toBe(false);
    expect(senales.aprobado).toBe(false);
  });

  it('aprobado es el AND de las tres: con las tres en verde, aprueba', () => {
    const senales = evaluarSenales(
      '¿cuál es el precio del curso?',
      candidato('¿Cuál es el precio del curso?', 0.95),
      0.5,
      UMBRALES,
    );

    expect(senales.aprobado).toBe(true);
    expect(senales.aprobado).toBe(
      senales.pasaUmbral && senales.pasaMargen && senales.pasaOverlap,
    );
  });

  it('con los mínimos en cero se comporta como el matching anterior (solo umbral)', () => {
    // Es la vía de escape documentada en env.ts: aflojar sin tocar código.
    const sinMinimos: UmbralesFaqMatch = { umbral: 0.85, margenMinimo: 0, overlapMinimo: 0 };

    const senales = evaluarSenales(
      '¿a qué hora abren?',
      candidato('¿Cuál es el precio del curso?', 0.87),
      0.869,
      sinMinimos,
    );

    expect(senales.aprobado).toBe(true);
  });

  it('reporta el desglose completo para que el probador pueda mostrarlo', () => {
    const senales = evaluarSenales(
      '¿cuál es el precio?',
      candidato('¿Cuál es el precio del curso?', 0.92),
      0.8,
      UMBRALES,
    );

    expect(senales.score).toBe(0.92);
    expect(senales.segundoScore).toBe(0.8);
    expect(senales.margen).toBeCloseTo(0.12, 10);
    expect(senales.overlap).toBeGreaterThan(0);
  });
});
