import { describe, it, expect } from 'vitest';
import {
  MAX_BYTES_IMAGEN,
  combinarFechaHora,
  distanciaRelativa,
  horaDe,
  problemaConHora,
  validarImagen,
} from './programacion.js';

function archivo(tipo: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], 'x', { type: tipo });
}

describe('programación de campañas — reglas puras', () => {
  it('acepta JPG y PNG hasta 5 MB', () => {
    expect(validarImagen(archivo('image/png', 10)).ok).toBe(true);
    expect(validarImagen(archivo('image/jpeg', MAX_BYTES_IMAGEN)).ok).toBe(true);
  });

  it('rechaza otros tipos y archivos grandes con un motivo legible', () => {
    const gif = validarImagen(archivo('image/gif', 10));
    expect(gif).toEqual({ ok: false, motivo: 'La imagen tiene que ser JPG o PNG.' });

    const grande = validarImagen(archivo('image/png', MAX_BYTES_IMAGEN + 1));
    expect(grande.ok).toBe(false);
    if (!grande.ok) expect(grande.motivo).toMatch(/el máximo es/);
  });

  it('combina día y hora en hora local', () => {
    const fecha = combinarFechaHora(new Date(2026, 10, 12, 18, 45), '09:30');
    expect(fecha.getFullYear()).toBe(2026);
    expect(fecha.getDate()).toBe(12);
    expect(horaDe(fecha)).toBe('09:30');
    expect(fecha.getSeconds()).toBe(0);
  });

  it('exige una hora futura con margen', () => {
    const ahora = new Date(2026, 8, 26, 10, 0);
    expect(problemaConHora(null, ahora)).toMatch(/Elige el día/);
    expect(problemaConHora(new Date(2026, 8, 26, 10, 1), ahora)).toMatch(/margen/);
    expect(problemaConHora(new Date(2026, 8, 26, 11, 0), ahora)).toBeNull();
  });

  it('dice la distancia en palabras', () => {
    const ahora = new Date(2026, 8, 26, 10, 0);
    expect(distanciaRelativa(new Date(2026, 8, 29, 10, 0), ahora)).toBe('dentro de 3 días');
    expect(distanciaRelativa(new Date(2026, 8, 26, 12, 0), ahora)).toBe('dentro de 2 horas');
  });
});
