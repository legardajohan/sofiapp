import { describe, it, expect } from 'vitest';
import {
  diaSemanaDeFecha,
  diasInclusivos,
  esZonaHorariaValida,
  fechaLocal,
  finDelDiaEnZona,
  inicioDelDiaEnZona,
  localAUtc,
  momentoLocal,
  sumarDias,
} from './zona-horaria.util.js';

describe('zona-horaria.util', () => {
  describe('localAUtc', () => {
    it('America/Bogota (UTC-5, sin horario de verano)', () => {
      expect(localAUtc('2026-11-02', '08:00', 'America/Bogota').toISOString()).toBe('2026-11-02T13:00:00.000Z');
      expect(localAUtc('2026-11-02', '00:00', 'America/Bogota').toISOString()).toBe('2026-11-02T05:00:00.000Z');
    });

    it('24:00 es la medianoche del día siguiente', () => {
      expect(localAUtc('2026-11-02', '24:00', 'America/Bogota').toISOString()).toBe('2026-11-03T05:00:00.000Z');
    });

    it('America/New_York a ambos lados del cambio de horario', () => {
      // Invierno (EST, UTC-5) y verano (EDT, UTC-4).
      expect(localAUtc('2026-01-15', '09:00', 'America/New_York').toISOString()).toBe('2026-01-15T14:00:00.000Z');
      expect(localAUtc('2026-07-15', '09:00', 'America/New_York').toISOString()).toBe('2026-07-15T13:00:00.000Z');
    });

    it('en el hueco del cambio a verano devuelve el primer instante válido tras el hueco', () => {
      // 2026-03-08: en Nueva York las 02:00–03:00 no existen; 03:00 EDT = 07:00Z.
      expect(localAUtc('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe('2026-03-08T07:00:00.000Z');
      // Europa: 2026-03-29, 02:00–03:00 no existen en Madrid; 03:00 CEST = 01:00Z.
      expect(localAUtc('2026-03-29', '02:30', 'Europe/Madrid').toISOString()).toBe('2026-03-29T01:00:00.000Z');
    });

    it('en el solape del cambio a invierno devuelve la primera ocurrencia', () => {
      // 2026-11-01: 01:30 existe dos veces en Nueva York; la primera es EDT (05:30Z).
      expect(localAUtc('2026-11-01', '01:30', 'America/New_York').toISOString()).toBe('2026-11-01T05:30:00.000Z');
      // 2026-10-25: 02:30 existe dos veces en Madrid; la primera es CEST (00:30Z).
      expect(localAUtc('2026-10-25', '02:30', 'Europe/Madrid').toISOString()).toBe('2026-10-25T00:30:00.000Z');
    });
  });

  describe('fechaLocal y momentoLocal', () => {
    it('cerca de la medianoche la fecha local difiere de la UTC', () => {
      const instante = new Date('2026-11-03T03:30:00Z'); // 22:30 del 2 en Bogotá
      expect(fechaLocal(instante, 'America/Bogota')).toBe('2026-11-02');
      expect(fechaLocal(instante, 'UTC')).toBe('2026-11-03');
      expect(momentoLocal(instante, 'America/Bogota')).toEqual({ dia: 1, hora: '22:30' });
    });
  });

  it('sumarDias y diaSemanaDeFecha cruzan meses y años', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(diaSemanaDeFecha('2026-11-03')).toBe(2);
  });

  it('esZonaHorariaValida', () => {
    expect(esZonaHorariaValida('America/Bogota')).toBe(true);
    expect(esZonaHorariaValida('Europe/Madrid')).toBe(true);
    expect(esZonaHorariaValida('Marte/Olympus')).toBe(false);
    expect(esZonaHorariaValida('')).toBe(false);
  });

  describe('HU-MARK-07 — rangos de día en zona', () => {
    it('fechaLocal devuelve el día del calendario local', () => {
      const instante = new Date('2026-10-31T02:00:00.000Z');
      expect(fechaLocal(instante, 'America/Bogota')).toBe('2026-10-30');
      expect(fechaLocal(instante, 'UTC')).toBe('2026-10-31');
    });

    it('inicioDelDiaEnZona y finDelDiaEnZona acotan el día local', () => {
      expect(inicioDelDiaEnZona('2026-10-28', 'America/Bogota').toISOString()).toBe('2026-10-28T05:00:00.000Z');
      expect(finDelDiaEnZona('2026-10-28', 'America/Bogota').toISOString()).toBe('2026-10-29T04:59:59.999Z');
      // Día del cambio a invierno en Madrid: dura 25 h.
      expect(inicioDelDiaEnZona('2026-10-25', 'Europe/Madrid').toISOString()).toBe('2026-10-24T22:00:00.000Z');
      expect(finDelDiaEnZona('2026-10-25', 'Europe/Madrid').toISOString()).toBe('2026-10-25T22:59:59.999Z');
    });

    it('diasInclusivos cuenta ambos extremos', () => {
      expect(diasInclusivos('2026-10-01', '2026-10-01')).toBe(1);
      expect(diasInclusivos('2026-10-01', '2026-10-31')).toBe(31);
    });
  });
});
