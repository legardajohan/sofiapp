import { describe, it, expect } from 'vitest';
import { resolverRangoAudiencia } from './campaign.rango.js';

const BOGOTA = 'America/Bogota';
const NUEVA_YORK = 'America/New_York';
const HORA = 3_600_000;
// 31/10/2026 13:00 UTC = 08:00 en Bogotá.
const AHORA = new Date('2026-10-31T13:00:00.000Z');

describe('HU-MARK-07 — resolverRangoAudiencia (puro)', () => {
  it.each([
    ['1d', 24],
    ['3d', 72],
    ['7d', 168],
  ] as const)('el preset %s es una ventana rodante de %i h hasta ahora', (rango, horas) => {
    const r = resolverRangoAudiencia({ rango }, BOGOTA, AHORA, 90);
    expect(r.hasta.getTime()).toBe(AHORA.getTime());
    expect(AHORA.getTime() - r.desde.getTime()).toBe(horas * HORA);
  });

  it('custom va de las 00:00 del inicio a las 23:59:59.999 del fin, en la zona del tenant', () => {
    const r = resolverRangoAudiencia(
      { rango: 'custom', desde: '2026-10-20', hasta: '2026-10-25' },
      BOGOTA,
      AHORA,
      90,
    );
    // Bogotá es UTC−5 todo el año: 00:00 local = 05:00 UTC.
    expect(r.desde.toISOString()).toBe('2026-10-20T05:00:00.000Z');
    expect(r.hasta.toISOString()).toBe('2026-10-26T04:59:59.999Z');
  });

  it('respeta el cambio de horario de una zona con DST', () => {
    // EE. UU. sale del horario de verano el 1/11/2026: ese día dura 25 h.
    const ahora = new Date('2026-11-05T12:00:00.000Z');
    const r = resolverRangoAudiencia(
      { rango: 'custom', desde: '2026-10-31', hasta: '2026-11-01' },
      NUEVA_YORK,
      ahora,
      90,
    );
    expect(r.desde.toISOString()).toBe('2026-10-31T04:00:00.000Z'); // EDT, UTC−4
    expect(r.hasta.toISOString()).toBe('2026-11-02T04:59:59.999Z'); // EST, UTC−5
  });

  it('si el fin es hoy, se recorta a ahora', () => {
    const r = resolverRangoAudiencia(
      { rango: 'custom', desde: '2026-10-30', hasta: '2026-10-31' },
      BOGOTA,
      AHORA,
      90,
    );
    expect(r.hasta.getTime()).toBe(AHORA.getTime());
  });

  it('"hoy" se decide en la zona del tenant, no en UTC', () => {
    // 31/10 02:00 UTC = 30/10 21:00 en Bogotá: el 31 todavía es futuro allí.
    const ahora = new Date('2026-10-31T02:00:00.000Z');
    expect(() =>
      resolverRangoAudiencia({ rango: 'custom', desde: '2026-10-30', hasta: '2026-10-31' }, BOGOTA, ahora, 90),
    ).toThrow(/futuras/);
  });

  it('inicio posterior al fin → 400', () => {
    expect(() =>
      resolverRangoAudiencia({ rango: 'custom', desde: '2026-10-25', hasta: '2026-10-20' }, BOGOTA, AHORA, 90),
    ).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('fecha futura → 400', () => {
    expect(() =>
      resolverRangoAudiencia({ rango: 'custom', desde: '2026-10-30', hasta: '2026-11-02' }, BOGOTA, AHORA, 90),
    ).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('90 días se aceptan, 91 no', () => {
    expect(() =>
      resolverRangoAudiencia({ rango: 'custom', desde: '2026-08-03', hasta: '2026-10-31' }, BOGOTA, AHORA, 90),
    ).not.toThrow();
    expect(() =>
      resolverRangoAudiencia({ rango: 'custom', desde: '2026-08-02', hasta: '2026-10-31' }, BOGOTA, AHORA, 90),
    ).toThrow(/90 días/);
  });

  it('custom sin fechas → 400', () => {
    expect(() => resolverRangoAudiencia({ rango: 'custom' }, BOGOTA, AHORA, 90)).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});
