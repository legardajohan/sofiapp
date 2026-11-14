import { describe, it, expect } from 'vitest';
import { derivarEstado } from './organizador.estado.js';
import {
  HORA_AVISO_TODO_EL_DIA,
  instanteEnZona,
  instanteRecordatorio,
} from '../pendiente/pendiente.fechas.js';

const NOW = new Date('2026-11-10T15:00:00Z');
const ANTES = new Date('2026-11-10T14:00:00Z');
const DESPUES = new Date('2026-11-10T16:00:00Z');

describe('HU-PDF-02 — instante del recordatorio', () => {
  it('día + hora en Bogotá (UTC-5, sin horario de verano)', () => {
    expect(instanteEnZona('2026-11-10', '10:30', 'America/Bogota').toISOString()).toBe(
      '2026-11-10T15:30:00.000Z',
    );
  });

  it('respeta el horario de verano de la zona (Madrid: +2 en julio, +1 en enero)', () => {
    expect(instanteEnZona('2026-07-15', '09:00', 'Europe/Madrid').toISOString()).toBe(
      '2026-07-15T07:00:00.000Z',
    );
    expect(instanteEnZona('2026-01-15', '09:00', 'Europe/Madrid').toISOString()).toBe(
      '2026-01-15T08:00:00.000Z',
    );
  });

  it('un pendiente sin hora avisa a las 08:00 de ese día (D1)', () => {
    expect(HORA_AVISO_TODO_EL_DIA).toBe('08:00');
    expect(instanteRecordatorio('2026-11-10', null, 'America/Bogota').toISOString()).toBe(
      '2026-11-10T13:00:00.000Z',
    );
  });
});

describe('HU-PDF-02 — derivarEstado', () => {
  it('cerrado siempre es cerrado', () => {
    expect(derivarEstado({ estadoPendiente: 'cerrado', recordatorioAt: ANTES }, NOW)).toBe('cerrado');
  });

  it('abierto con el aviso en el futuro es pendiente', () => {
    expect(derivarEstado({ estadoPendiente: 'abierto', recordatorioAt: DESPUES }, NOW)).toBe(
      'pendiente',
    );
  });

  it('abierto con el aviso cumplido (incluido el instante exacto) es vencido', () => {
    expect(derivarEstado({ estadoPendiente: 'abierto', recordatorioAt: ANTES }, NOW)).toBe('vencido');
    expect(derivarEstado({ estadoPendiente: 'abierto', recordatorioAt: NOW }, NOW)).toBe('vencido');
  });

  it('pospuesto con aviso futuro es pospuesto, y vuelve a vencido al llegar su hora', () => {
    const nota = { estadoPendiente: 'abierto' as const, recordatorioAt: DESPUES, vecesPospuesto: 2 };
    expect(derivarEstado(nota, NOW)).toBe('pospuesto');
    expect(derivarEstado(nota, new Date('2026-11-10T16:00:01Z'))).toBe('vencido');
  });

  it('un pendiente legado sin instante calculado cuenta como pendiente', () => {
    expect(derivarEstado({ estadoPendiente: 'abierto', recordatorioAt: null }, NOW)).toBe('pendiente');
  });
});
