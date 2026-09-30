import { describe, it, expect } from 'vitest';
import { insertarEnCursor } from './insertarEnCursor.js';
import { elegirFormatoGrabacion, formatearDuracion, ondaDecorativa } from './audio.js';

describe('insertarEnCursor (HU-OMNI-07)', () => {
  it('inserta en medio del texto y deja el cursor detrás del emoji', () => {
    expect(insertarEnCursor('hola mundo', 5, 5, '👋 ')).toEqual({ valor: 'hola 👋 mundo', cursor: 8 });
  });

  it('al principio y al final', () => {
    expect(insertarEnCursor('hola', 0, 0, '🙂')).toEqual({ valor: '🙂hola', cursor: 2 });
    expect(insertarEnCursor('hola', 4, 4, '🙂')).toEqual({ valor: 'hola🙂', cursor: 6 });
  });

  it('reemplaza la selección', () => {
    expect(insertarEnCursor('me gusta mucho', 3, 8, '❤️')).toEqual({
      valor: 'me ❤️ mucho',
      cursor: 5,
    });
  });

  it('una selección hecha de derecha a izquierda se trata igual', () => {
    expect(insertarEnCursor('abcdef', 4, 1, 'X').valor).toBe('aXef');
  });

  it('sin selección conocida (el campo nunca tuvo foco) va al final', () => {
    expect(insertarEnCursor('hola', null, null, '🎉')).toEqual({ valor: 'hola🎉', cursor: 6 });
  });

  it('índices fuera de rango no rompen nada', () => {
    expect(insertarEnCursor('hola', 99, 120, '!').valor).toBe('hola!');
    expect(insertarEnCursor('hola', -3, -1, '!').valor).toBe('!hola');
  });

  it('no parte los emojis compuestos que ya estaban en el texto', () => {
    const previo = 'yo 👩🏽‍💻';
    const { valor } = insertarEnCursor(previo, previo.length, previo.length, ' 🇨🇴');

    expect(valor).toBe('yo 👩🏽‍💻 🇨🇴');
    // Los grafemas completos siguen enteros: 'y','o',' ','👩🏽‍💻',' ','🇨🇴'.
    const grafemas = [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(valor)];
    expect(grafemas.map((g) => g.segment)).toContain('👩🏽‍💻');
    expect(grafemas.map((g) => g.segment)).toContain('🇨🇴');
  });
});

describe('formatearDuracion', () => {
  it('m:ss', () => {
    expect(formatearDuracion(0)).toBe('0:00');
    expect(formatearDuracion(7.9)).toBe('0:07');
    expect(formatearDuracion(65)).toBe('1:05');
    expect(formatearDuracion(600)).toBe('10:00');
  });

  it('valores que no son una duración se muestran como 0:00', () => {
    expect(formatearDuracion(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatearDuracion(Number.NaN)).toBe('0:00');
    expect(formatearDuracion(-3)).toBe('0:00');
  });
});

describe('ondaDecorativa', () => {
  it('es estable para la misma semilla y distinta entre semillas', () => {
    expect(ondaDecorativa('msg-1', 32)).toEqual(ondaDecorativa('msg-1', 32));
    expect(ondaDecorativa('msg-1', 32)).not.toEqual(ondaDecorativa('msg-2', 32));
  });

  it('todas las alturas quedan entre 0.2 y 1', () => {
    for (const h of ondaDecorativa('cualquiera', 64)) {
      expect(h).toBeGreaterThanOrEqual(0.2);
      expect(h).toBeLessThanOrEqual(1);
    }
  });
});

describe('elegirFormatoGrabacion', () => {
  it('prefiere ogg/opus y cae a webm y a mp4 (Safari)', () => {
    expect(elegirFormatoGrabacion(() => true)).toBe('audio/ogg;codecs=opus');
    expect(elegirFormatoGrabacion((m) => m.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(elegirFormatoGrabacion((m) => m === 'audio/mp4')).toBe('audio/mp4');
  });

  it('sin ningún formato soportado devuelve null', () => {
    expect(elegirFormatoGrabacion(() => false)).toBeNull();
  });
});
