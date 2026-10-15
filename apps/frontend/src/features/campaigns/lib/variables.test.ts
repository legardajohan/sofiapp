import { describe, it, expect } from 'vitest';
import { segmentarCuerpo } from './variables.js';

describe('segmentarCuerpo — vista previa con variables (HU-MARK-05)', () => {
  it('sin variables sustituye los parámetros como siempre', () => {
    expect(segmentarCuerpo('Hola {{1}}, el {{2}}', ['Ana', 'lunes'])).toEqual([
      { texto: 'Hola ', variable: null },
      { texto: 'Ana', variable: null },
      { texto: ', el ', variable: null },
      { texto: 'lunes', variable: null },
    ]);
  });

  it('una variable se muestra por su nombre, no por el texto de respaldo', () => {
    const segmentos = segmentarCuerpo('Hola {{1}}', ['estudiante'], [{ indice: 0, campo: 'nombre' }]);
    expect(segmentos).toEqual([
      { texto: 'Hola ', variable: null },
      { texto: 'Nombre del contacto', variable: 'nombre' },
    ]);
  });

  it('un hueco sin valor queda literal', () => {
    expect(segmentarCuerpo('Hola {{1}}', [''])).toEqual([
      { texto: 'Hola ', variable: null },
      { texto: '{{1}}', variable: null },
    ]);
  });
});
