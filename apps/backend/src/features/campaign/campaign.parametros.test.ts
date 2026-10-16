import { describe, it, expect } from 'vitest';
import { assertParametrosDinamicos, resolverParametros } from './campaign.parametros.js';

describe('resolverParametros — variables de contacto (HU-MARK-05)', () => {
  it('sin variables devuelve los parámetros tal cual', () => {
    expect(resolverParametros(['hola', 'mundo'], [], { nombre: 'Ana', telefono: '57300' })).toEqual([
      'hola',
      'mundo',
    ]);
  });

  it('pone el nombre del contacto en el parámetro marcado', () => {
    expect(
      resolverParametros(['cliente', 'lunes'], [{ indice: 0, campo: 'nombre' }], {
        nombre: '  Ana  ',
        telefono: '57300',
      }),
    ).toEqual(['Ana', 'lunes']);
  });

  it('usa el respaldo si el contacto no tiene el dato o es solo espacios', () => {
    const dinamicos = [{ indice: 0, campo: 'nombre' as const }];
    expect(resolverParametros(['cliente'], dinamicos, { telefono: '57300' })).toEqual(['cliente']);
    expect(resolverParametros(['cliente'], dinamicos, { nombre: '   ', telefono: '57300' })).toEqual([
      'cliente',
    ]);
    expect(resolverParametros(['cliente'], dinamicos, { nombre: null, telefono: '57300' })).toEqual([
      'cliente',
    ]);
  });

  it('resuelve el teléfono', () => {
    expect(
      resolverParametros(['-'], [{ indice: 0, campo: 'telefono' }], { telefono: '573001112233' }),
    ).toEqual(['573001112233']);
  });

  it('no muta el array original', () => {
    const parametros = ['cliente'];
    resolverParametros(parametros, [{ indice: 0, campo: 'nombre' }], { nombre: 'Ana', telefono: '1' });
    expect(parametros).toEqual(['cliente']);
  });
});

describe('assertParametrosDinamicos', () => {
  it('acepta variables coherentes', () => {
    expect(() =>
      assertParametrosDinamicos(['cliente', 'x'], [{ indice: 0, campo: 'nombre' }]),
    ).not.toThrow();
  });

  it('rechaza un índice fuera de rango', () => {
    expect(() => assertParametrosDinamicos(['x'], [{ indice: 1, campo: 'nombre' }])).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('rechaza dos variables sobre el mismo parámetro', () => {
    expect(() =>
      assertParametrosDinamicos(
        ['x'],
        [
          { indice: 0, campo: 'nombre' },
          { indice: 0, campo: 'telefono' },
        ],
      ),
    ).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('rechaza una variable sin texto de respaldo', () => {
    expect(() => assertParametrosDinamicos(['  '], [{ indice: 0, campo: 'nombre' }])).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});
