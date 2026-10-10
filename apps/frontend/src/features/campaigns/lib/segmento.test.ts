import { describe, it, expect } from 'vitest';
import {
  alternarExclusion,
  combinacionRelevante,
  criteriosAplicados,
  devolverExcluidos,
  limpiarCriterios,
  quitarCriterio,
  sinExclusiones,
} from './segmento.js';

describe('lógica del constructor de audiencias', () => {
  const catalogos = {
    etapas: [{ key: 'nuevo', label: 'Nuevo', color: '#2563EB' }],
    tagIds: [{ key: 't1', label: 'VIP', color: '#7C3AED' }],
  };

  it('pinta los criterios en el orden de la pantalla, con su nombre del catálogo', () => {
    expect(criteriosAplicados({ tagIds: ['t1'], etapas: ['nuevo'] }, catalogos)).toEqual([
      { eje: 'etapas', key: 'nuevo', label: 'Nuevo', color: '#2563EB' },
      { eje: 'tagIds', key: 't1', label: 'VIP', color: '#7C3AED' },
    ]);
  });

  it('una clave fuera del catálogo se enseña cruda en vez de desaparecer: sigue filtrando', () => {
    expect(criteriosAplicados({ etapas: ['archivada'] }, catalogos)).toEqual([
      { eje: 'etapas', key: 'archivada', label: 'archivada', color: undefined },
    ]);
  });

  it('quitar el último valor de un eje borra el eje', () => {
    expect(quitarCriterio({ etapas: ['nuevo'], tagIds: ['t1'] }, 'etapas', 'nuevo')).toEqual({
      tagIds: ['t1'],
    });
    expect(quitarCriterio({ etapas: ['nuevo', 'pagado'] }, 'etapas', 'nuevo')).toEqual({
      etapas: ['pagado'],
    });
  });

  it('limpiar los criterios conserva exclusiones y combinación', () => {
    expect(
      limpiarCriterios({ etapas: ['nuevo'], combinacion: 'o', excluirClienteIds: ['c1'] }),
    ).toEqual({ combinacion: 'o', excluirClienteIds: ['c1'] });
  });

  it('alternar una exclusión la añade, la quita, y no deja una lista vacía colgando', () => {
    const conAna = alternarExclusion({ etapas: ['nuevo'] }, 'ana');
    expect(conAna.excluirClienteIds).toEqual(['ana']);
    expect(alternarExclusion(conAna, 'ana')).toEqual({ etapas: ['nuevo'] });
  });

  it('las exclusiones no forman parte de quién aparece en la lista', () => {
    expect(sinExclusiones({ etapas: ['nuevo'], excluirClienteIds: ['c1'] })).toEqual({
      etapas: ['nuevo'],
    });
    expect(devolverExcluidos({ excluirClienteIds: ['c1'] })).toEqual({});
  });

  it('la combinación solo importa con etapas Y etiquetas a la vez', () => {
    expect(combinacionRelevante({ etapas: ['nuevo'] })).toBe(false);
    expect(combinacionRelevante({ etapas: ['nuevo'], tagIds: [] })).toBe(false);
    expect(combinacionRelevante({ etapas: ['nuevo'], tagIds: ['t1'] })).toBe(true);
  });
});
