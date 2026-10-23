import { describe, it, expect } from 'vitest';
import { resumenTrigger, triggerPorTipo, validarTrigger } from './trigger.js';

describe('trigger — helpers del editor (HU-FLOW-04)', () => {
  it('triggerPorTipo descarta lo del tipo anterior y arranca con la forma mínima válida', () => {
    expect(triggerPorTipo('siempre', { tipo: 'palabra_clave', palabras: ['x'] })).toEqual({ tipo: 'siempre' });
    expect(triggerPorTipo('palabra_clave')).toEqual({ tipo: 'palabra_clave', palabras: [] });
    const horario = triggerPorTipo('horario');
    expect(horario.horario?.dias).toEqual([1, 2, 3, 4, 5]);
    expect(validarTrigger(horario)).toBeNull();
  });

  it('volver a un tipo conserva lo ya escrito', () => {
    const anterior = { tipo: 'palabra_clave' as const, palabras: ['precio'] };
    expect(triggerPorTipo('palabra_clave', anterior).palabras).toEqual(['precio']);
  });

  it('resumenTrigger dice cuándo arranca de un vistazo', () => {
    expect(resumenTrigger({ tipo: 'siempre' })).toBe('Cualquier mensaje');
    expect(resumenTrigger({ tipo: 'primer_mensaje' })).toBe('Primer mensaje');
    expect(resumenTrigger({ tipo: 'palabra_clave', palabras: [] })).toBe('Sin palabras aún');
    expect(resumenTrigger({ tipo: 'palabra_clave', palabras: ['precio', 'horario', 'sede'] })).toBe(
      'precio, horario +1',
    );
    expect(
      resumenTrigger({
        tipo: 'horario',
        horario: { dias: [1, 2, 3, 4, 5], desde: '08:00', hasta: '18:00', zonaHoraria: 'America/Bogota' },
      }),
    ).toBe('Lun–Vie 08:00–18:00');
  });

  it('validarTrigger espeja lo que exige el backend', () => {
    expect(validarTrigger({ tipo: 'siempre' })).toBeNull();
    expect(validarTrigger({ tipo: 'palabra_clave', palabras: [] })).toMatch(/al menos una palabra/);
    const horario = { dias: [1], desde: '08:00', hasta: '18:00', zonaHoraria: 'America/Bogota' };
    expect(validarTrigger({ tipo: 'horario', horario })).toBeNull();
    expect(validarTrigger({ tipo: 'horario', horario: { ...horario, dias: [] } })).toMatch(/al menos un día/);
    expect(validarTrigger({ tipo: 'horario', horario: { ...horario, desde: '18:00', hasta: '08:00' } })).toMatch(
      /anterior/,
    );
  });
});
