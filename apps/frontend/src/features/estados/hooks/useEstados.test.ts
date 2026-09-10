import { describe, it, expect } from 'vitest';
import { ordenarComo } from './useEstados.js';
import type { EstadoDTO } from '../types.js';

function etapa(id: string, orden: number): EstadoDTO {
  return {
    id,
    key: id,
    label: id,
    color: '#2563EB',
    orden,
    activo: true,
    esDefecto: false,
    esSalida: false,
  };
}

const CATALOGO = [etapa('a', 0), etapa('b', 1), etapa('c', 2)];

describe('ordenarComo — parche optimista del orden del embudo', () => {
  it('deja la lista en el orden de los ids', () => {
    const reordenado = ordenarComo(CATALOGO, ['c', 'a', 'b']);

    expect(reordenado.map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('renumera `orden` a la posición nueva: es lo que el listado usa para pintar', () => {
    const reordenado = ordenarComo(CATALOGO, ['c', 'a', 'b']);

    expect(reordenado.map((e) => e.orden)).toEqual([0, 1, 2]);
  });

  it('no pierde una etapa cuyo id no venga en la lista: la deja al final', () => {
    const reordenado = ordenarComo(CATALOGO, ['c', 'a']);

    expect(reordenado.map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('ignora un id que no está en el catálogo en vez de meter un hueco', () => {
    const reordenado = ordenarComo(CATALOGO, ['c', 'fantasma', 'a', 'b']);

    expect(reordenado.map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('no muta la lista original', () => {
    ordenarComo(CATALOGO, ['c', 'b', 'a']);

    expect(CATALOGO.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});
