import { describe, it, expect } from 'vitest';
import { aDiaCivil, estaVencido, etiquetaDia, etiquetaProgramacion } from './agenda.js';

// Miércoles 15 de octubre de 2026, 10:00 hora local.
const AHORA = new Date(2026, 9, 15, 10, 0);

describe('agenda (HU-PDF-01 A1)', () => {
  it('formatea el día civil local sin pasar por UTC', () => {
    expect(aDiaCivil(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('nombra hoy, mañana y ayer; el resto, con fecha corta', () => {
    expect(etiquetaDia('2026-10-15', AHORA)).toBe('Hoy');
    expect(etiquetaDia('2026-10-16', AHORA)).toBe('Mañana');
    expect(etiquetaDia('2026-10-14', AHORA)).toBe('Ayer');
    expect(etiquetaDia('2026-10-20', AHORA)).toMatch(/20 oct/);
    expect(etiquetaDia('2027-01-02', AHORA)).toMatch(/2027/);
  });

  it('dice «Todo el día» cuando no hay hora', () => {
    expect(etiquetaProgramacion('2026-10-15', null, AHORA)).toBe('Hoy · Todo el día');
    expect(etiquetaProgramacion('2026-10-15', '16:00', AHORA)).toBe('Hoy · 16:00');
  });

  it('con hora vence a ese minuto; sin hora, al terminar el día', () => {
    expect(estaVencido('2026-10-15', '09:59', AHORA)).toBe(true);
    expect(estaVencido('2026-10-15', '10:01', AHORA)).toBe(false);
    expect(estaVencido('2026-10-15', null, AHORA)).toBe(false);
    expect(estaVencido('2026-10-14', null, AHORA)).toBe(true);
  });
});
