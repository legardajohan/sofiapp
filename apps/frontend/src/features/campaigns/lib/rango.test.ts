import { describe, it, expect } from 'vitest';
import { aAudiencia, diasInclusivos, sugerirNombreEtiqueta } from './rango.js';

describe('HU-MARK-07 — lib/rango', () => {
  it('sugiere «Campaña {nombre} - {dd/mm/aaaa}»', () => {
    expect(sugerirNombreEtiqueta('Promo', new Date(2026, 9, 31))).toBe('Campaña Promo - 31/10/2026');
  });

  it('recorta el nombre, nunca la fecha, para no pasar de 60', () => {
    const s = sugerirNombreEtiqueta('x'.repeat(80), new Date(2026, 9, 31));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith(' - 31/10/2026')).toBe(true);
    expect(s).toContain('…');
  });

  it('un preset se manda tal cual; un personalizado incompleto no se manda', () => {
    expect(aAudiencia({ rango: '3d' })).toEqual({ tipo: 'mensajes_recientes', rango: '3d' });
    expect(aAudiencia({ rango: 'custom', desde: new Date(2026, 9, 1) })).toBeNull();
    expect(
      aAudiencia({ rango: 'custom', desde: new Date(2026, 9, 1), hasta: new Date(2026, 9, 5) }),
    ).toEqual({ tipo: 'mensajes_recientes', rango: 'custom', desde: '2026-10-01', hasta: '2026-10-05' });
  });

  it('cuenta días inclusivos', () => {
    expect(diasInclusivos(new Date(2026, 9, 1), new Date(2026, 9, 1))).toBe(1);
    expect(diasInclusivos(new Date(2026, 7, 3), new Date(2026, 9, 31))).toBe(90);
  });
});
