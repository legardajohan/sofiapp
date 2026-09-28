/**
 * Piezas puras de HU-OMNI-07 en `media.service`: el parser de la cabecera `Range` y la separación
 * entre los dos caminos de subida (adjuntar frente a nota de voz).
 */
import { describe, it, expect } from 'vitest';
import { AppError } from '../../utils/AppError.js';
import { clasificarArchivoSaliente, resolverRangoBytes } from './media.service.js';

describe('resolverRangoBytes', () => {
  it('sin cabecera no hay rango: se sirve el archivo completo', () => {
    expect(resolverRangoBytes(undefined, 100)).toBeUndefined();
  });

  it('interpreta un rango cerrado, uno abierto y un sufijo', () => {
    expect(resolverRangoBytes('bytes=10-19', 100)).toEqual({ inicio: 10, fin: 19 });
    expect(resolverRangoBytes('bytes=90-', 100)).toEqual({ inicio: 90, fin: 99 });
    expect(resolverRangoBytes('bytes=-5', 100)).toEqual({ inicio: 95, fin: 99 });
  });

  it('recorta un final que se pasa del tamaño (lo que pide Chrome al empezar)', () => {
    expect(resolverRangoBytes('bytes=0-999999', 100)).toEqual({ inicio: 0, fin: 99 });
  });

  it('un inicio más allá del final es insatisfacible (416)', () => {
    expect(resolverRangoBytes('bytes=100-', 100)).toBeNull();
    expect(resolverRangoBytes('bytes=-0', 100)).toBeNull();
  });

  it('formas no soportadas se ignoran en vez de fallar (se sirve completo)', () => {
    expect(resolverRangoBytes('bytes=0-1,5-9', 100)).toBeUndefined();
    expect(resolverRangoBytes('items=0-1', 100)).toBeUndefined();
    expect(resolverRangoBytes('bytes=9-2', 100)).toBeUndefined();
    expect(resolverRangoBytes('bytes=0-1', 0)).toBeUndefined();
  });
});

describe('clasificarArchivoSaliente — caminos de subida (HU-OMNI-07)', () => {
  it('el menú de adjuntar sigue sin aceptar audio: no pasaría por la transcodificación', () => {
    expect(() => clasificarArchivoSaliente('audio/webm', 10)).toThrow(AppError);
  });

  it('el camino de nota de voz acepta lo que graba cada navegador, con o sin codecs', () => {
    expect(clasificarArchivoSaliente('audio/webm;codecs=opus', 10, ['audio'])).toBe('audio');
    expect(clasificarArchivoSaliente('audio/mp4', 10, ['audio'])).toBe('audio');
    expect(clasificarArchivoSaliente('audio/ogg; codecs=opus', 10, ['audio'])).toBe('audio');
  });

  it('el camino de nota de voz rechaza lo que no es audio con 415', () => {
    const error = (() => {
      try {
        clasificarArchivoSaliente('image/jpeg', 10, ['audio']);
        return null;
      } catch (e: unknown) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(415);
  });
});
