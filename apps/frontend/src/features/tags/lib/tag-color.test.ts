import { describe, it, expect } from 'vitest';
import { tagColors, tagContrast } from './tag-color.js';

/**
 * El criterio 9 del spec: para CUALQUIER hex que el administrador elija, el texto del chip debe
 * alcanzar 4.5:1 contra su fondo, en claro y en oscuro. Esto es lo que hace seguro haber permitido
 * color libre en vez de una paleta cerrada.
 */
const CASOS = [
  '#000000', // negro puro
  '#FFFFFF', // blanco puro
  '#1E3A8A', // azul muy oscuro: el que desaparecería en dark mode sin corrección
  '#FFFF00', // amarillo puro: el que se pierde en light mode
  '#16A34A', // verde de semáforo
  '#EA580C', // naranja de semáforo
  '#DC2626', // rojo de semáforo
  '#2563EB', // azul de semáforo
  '#7C3AED',
  '#0891B2',
];

describe('tag-color — contraste garantizado (criterio 9 del spec)', () => {
  for (const hex of CASOS) {
    it(`${hex} cumple 4.5:1 en tema claro`, () => {
      expect(tagContrast(hex, 'light')).toBeGreaterThanOrEqual(4.5);
    });

    it(`${hex} cumple 4.5:1 en tema oscuro`, () => {
      expect(tagContrast(hex, 'dark')).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('un color extremo se corrige en vez de devolverse tal cual', () => {
    // #FFFF00 sobre un fondo amarillo claro sería ilegible: el texto debe oscurecerse.
    const { fg } = tagColors('#FFFF00', 'light');
    expect(fg).not.toBe('rgb(255 255 0)');
  });

  it('devuelve colores distintos por tema para el mismo hex', () => {
    const claro = tagColors('#1E3A8A', 'light');
    const oscuro = tagColors('#1E3A8A', 'dark');
    expect(claro.bg).not.toBe(oscuro.bg);
    expect(claro.fg).not.toBe(oscuro.fg);
  });
});

describe('tag-color — dato corrupto', () => {
  it('un hex inválido cae a los tokens neutros sin lanzar', () => {
    for (const malo of ['', 'rojo', '#FFF', '#GGGGGG', 'rgb(1,2,3)']) {
      const colors = tagColors(malo, 'light');
      expect(colors.bg).toContain('hsl(');
      expect(colors.fg).toContain('hsl(');
    }
  });
});
