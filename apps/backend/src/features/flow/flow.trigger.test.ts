import { describe, it, expect } from 'vitest';
import { evaluarTrigger } from './flow.trigger.js';
import type { IHorarioTrigger } from './flow.types.js';

const ctx = (texto: string, extra: { esPrimerMensaje?: boolean; ahora?: Date } = {}) => ({
  texto,
  esPrimerMensaje: extra.esPrimerMensaje ?? false,
  ahora: extra.ahora ?? new Date('2026-01-01T12:00:00Z'),
});

describe('evaluarTrigger', () => {
  it('sin trigger o con "siempre" siempre arranca', () => {
    expect(evaluarTrigger(undefined, ctx('cualquier cosa'))).toBe(true);
    expect(evaluarTrigger({ tipo: 'siempre' }, ctx(''))).toBe(true);
  });

  describe('palabra_clave', () => {
    const trigger = { tipo: 'palabra_clave' as const, palabras: ['precio', 'horario'] };

    it('coincide sin distinguir mayúsculas ni tildes', () => {
      expect(evaluarTrigger(trigger, ctx('Quiero saber los PRECIOS del preicfes'))).toBe(true);
      expect(evaluarTrigger({ ...trigger, palabras: ['información'] }, ctx('necesito INFORMACION'))).toBe(true);
    });

    it('basta con una de las palabras', () => {
      expect(evaluarTrigger(trigger, ctx('¿cuál es el horario del sábado?'))).toBe(true);
    });

    it('sin ninguna palabra no arranca', () => {
      expect(evaluarTrigger(trigger, ctx('hola buenas tardes'))).toBe(false);
    });

    it('un mensaje vacío (p. ej. un audio) no arranca', () => {
      expect(evaluarTrigger(trigger, ctx(''))).toBe(false);
    });

    it('una palabra vacía no hace que todo coincida', () => {
      expect(evaluarTrigger({ tipo: 'palabra_clave', palabras: ['  '] }, ctx('hola'))).toBe(false);
    });
  });

  describe('primer_mensaje', () => {
    it('arranca solo si es el primer mensaje del cliente', () => {
      expect(evaluarTrigger({ tipo: 'primer_mensaje' }, ctx('hola', { esPrimerMensaje: true }))).toBe(true);
      expect(evaluarTrigger({ tipo: 'primer_mensaje' }, ctx('hola', { esPrimerMensaje: false }))).toBe(false);
    });
  });

  describe('horario', () => {
    // Lunes a viernes, 08:00–18:00 en Bogotá (UTC-5, sin horario de verano).
    const horario: IHorarioTrigger = {
      dias: [1, 2, 3, 4, 5],
      desde: '08:00',
      hasta: '18:00',
      zonaHoraria: 'America/Bogota',
    };
    const trigger = { tipo: 'horario' as const, horario };

    it('dentro del rango en la zona indicada', () => {
      // Miércoles 2026-01-07 15:00 UTC = 10:00 en Bogotá.
      expect(evaluarTrigger(trigger, ctx('x', { ahora: new Date('2026-01-07T15:00:00Z') }))).toBe(true);
    });

    it('interpreta la hora en la zona, no en UTC', () => {
      // 02:00 UTC del jueves = 21:00 del miércoles en Bogotá → fuera aunque en UTC sea de madrugada.
      expect(evaluarTrigger(trigger, ctx('x', { ahora: new Date('2026-01-08T02:00:00Z') }))).toBe(false);
      // 14:00 UTC = 09:00 Bogotá → dentro, aunque 14 también estaría dentro en UTC; el contraste es el anterior.
      expect(evaluarTrigger(trigger, ctx('x', { ahora: new Date('2026-01-07T14:00:00Z') }))).toBe(true);
    });

    it('día no permitido', () => {
      // Sábado 2026-01-10 15:00 UTC = 10:00 Bogotá.
      expect(evaluarTrigger(trigger, ctx('x', { ahora: new Date('2026-01-10T15:00:00Z') }))).toBe(false);
    });

    it('el rango es [desde, hasta): incluye el inicio y excluye el fin', () => {
      expect(evaluarTrigger(trigger, ctx('x', { ahora: new Date('2026-01-07T13:00:00Z') }))).toBe(true); // 08:00
      expect(evaluarTrigger(trigger, ctx('x', { ahora: new Date('2026-01-07T23:00:00Z') }))).toBe(false); // 18:00
    });

    it('un trigger horario sin horario (dato corrupto) abre en vez de cerrar', () => {
      expect(evaluarTrigger({ tipo: 'horario' }, ctx('x'))).toBe(true);
    });
  });
});
