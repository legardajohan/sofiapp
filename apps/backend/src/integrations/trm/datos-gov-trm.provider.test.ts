import { describe, it, expect } from 'vitest';
import { parseTrmDatosGov } from './datos-gov-trm.provider.js';

// Payload real del recurso 32sa-8pi3 (datos.gov.co), ordenado por vigenciadesde DESC.
const PAYLOAD_REAL = [
  { valor: '3248.87', unidad: 'COP', vigenciadesde: '2026-07-11T00:00:00.000', vigenciahasta: '2026-07-14T00:00:00.000' },
];

describe('parseTrmDatosGov — parseo de la respuesta oficial', () => {
  it('extrae tasa, fecha de vigencia y fuente del primer registro', () => {
    const result = parseTrmDatosGov(PAYLOAD_REAL);
    expect(result.tasaCopPorUsd).toBe('3248.87');
    expect(result.fechaVigencia.toISOString().slice(0, 10)).toBe('2026-07-11');
    expect(result.fuente).toContain('Superintendencia Financiera');
  });

  it('lanza si el arreglo está vacío', () => {
    expect(() => parseTrmDatosGov([])).toThrow();
  });

  it('lanza si faltan los campos valor/vigenciadesde', () => {
    expect(() => parseTrmDatosGov([{ unidad: 'COP' }])).toThrow();
  });

  it('lanza si vigenciadesde no es una fecha válida', () => {
    expect(() => parseTrmDatosGov([{ valor: '3248.87', vigenciadesde: 'no-es-fecha' }])).toThrow();
  });

  it('lanza si el payload no es un arreglo', () => {
    expect(() => parseTrmDatosGov({ valor: '3248.87' })).toThrow();
  });
});
