import { describe, it, expect } from 'vitest';
import { diasInclusivos, esZonaValida, fechaEnZona } from './zona-horaria.util.js';

describe('HU-MARK-07 — zona-horaria.util', () => {
  it('reconoce zonas IANA reales y rechaza las inventadas', () => {
    expect(esZonaValida('America/Bogota')).toBe(true);
    expect(esZonaValida('Europe/Madrid')).toBe(true);
    expect(esZonaValida('Marte/Olympus')).toBe(false);
    expect(esZonaValida('')).toBe(false);
  });

  it('fechaEnZona devuelve el día del calendario local', () => {
    const instante = new Date('2026-10-31T02:00:00.000Z');
    expect(fechaEnZona(instante, 'America/Bogota')).toBe('2026-10-30');
    expect(fechaEnZona(instante, 'UTC')).toBe('2026-10-31');
  });

  it('diasInclusivos cuenta ambos extremos', () => {
    expect(diasInclusivos('2026-10-01', '2026-10-01')).toBe(1);
    expect(diasInclusivos('2026-10-01', '2026-10-31')).toBe(31);
  });
});
