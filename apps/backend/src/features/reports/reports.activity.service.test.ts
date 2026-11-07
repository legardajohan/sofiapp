import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { crearAsesor } from './reports.fixtures.js';
import { ActividadAsesor } from '../activity/activity.model.js';
import { getAdvisorActivity, getAdvisorReport, periodoDe } from './reports.service.js';
import type { AdvisorActivityQuery } from './reports.validation.js';

/*
 * HU-REP-06 — tiempo activo en «Productividad por asesor». Las cubetas se insertan con el driver
 * para fijar la hora a mano.
 */

const NOW = new Date('2026-10-01T12:00:00Z');

async function cubeta(tenantId: Types.ObjectId, userId: Types.ObjectId, hora: string, segundos: number): Promise<void> {
  const h = new Date(hora);
  await ActividadAsesor.collection.insertOne({
    tenantId,
    userId,
    hora: h,
    segundosActivos: segundos,
    primerLatido: h,
    ultimoLatido: h,
  });
}

const query = (q: Partial<AdvisorActivityQuery>): AdvisorActivityQuery => ({
  tz: 'UTC',
  granularidad: 'dia',
  ...q,
});

describe('periodoDe', () => {
  it.each([
    ['2026-09-17', 'dia', '2026-09-17'],
    ['2026-09-17', 'semana', '2026-09-14'], // jueves → lunes
    ['2026-09-14', 'semana', '2026-09-14'], // lunes → sí mismo
    ['2026-09-20', 'semana', '2026-09-14'], // domingo → lunes anterior
    ['2026-09-17', 'mes', '2026-09-01'],
  ] as const)('%s en %s → %s', (dia, g, esperado) => {
    expect(periodoDe(dia, g)).toBe(esperado);
  });
});

describe('getAdvisorReport — segundosActivos (HU-REP-06)', () => {
  const tenantId = new Types.ObjectId();

  it('suma el tiempo del rango por asesor y en totales, y lista a quien solo tiene tiempo activo', async () => {
    const ana = await crearAsesor(tenantId, 'Ana');
    const beto = await crearAsesor(tenantId, 'Beto');
    await cubeta(tenantId, ana, '2026-09-10T14:00:00Z', 1800);
    await cubeta(tenantId, ana, '2026-09-11T15:00:00Z', 600);
    await cubeta(tenantId, beto, '2026-09-10T14:00:00Z', 300);
    await cubeta(tenantId, ana, '2026-08-01T10:00:00Z', 9999); // fuera del rango

    const r = await getAdvisorReport(
      tenantId.toString(),
      { desde: new Date('2026-09-01'), hasta: new Date('2026-09-30') },
      NOW,
    );
    expect(r.porAsesor.find((f) => f.nombre === 'Ana')?.segundosActivos).toBe(2400);
    expect(r.porAsesor.find((f) => f.nombre === 'Beto')?.segundosActivos).toBe(300);
    expect(r.totales.segundosActivos).toBe(2700);
  });

  it('un asesor inactivo con tiempo activo en el periodo sigue apareciendo', async () => {
    const caro = await crearAsesor(tenantId, 'Caro', { activo: false });
    await cubeta(tenantId, caro, '2026-09-10T14:00:00Z', 60);
    const r = await getAdvisorReport(tenantId.toString(), { desde: new Date('2026-09-01'), hasta: new Date('2026-09-30') }, NOW);
    expect(r.porAsesor.map((f) => f.nombre)).toContain('Caro');
  });
});

describe('getAdvisorActivity (HU-REP-06)', () => {
  const tenantId = new Types.ObjectId();
  const rango = { desde: new Date('2026-09-14'), hasta: new Date('2026-09-27') };

  it('por día: todos los días del rango, también los vacíos, con segundos por asesor', async () => {
    const ana = await crearAsesor(tenantId, 'Ana');
    await cubeta(tenantId, ana, '2026-09-15T10:00:00Z', 1200);
    await cubeta(tenantId, ana, '2026-09-15T11:00:00Z', 600);

    const r = await getAdvisorActivity(tenantId.toString(), query(rango), NOW);
    expect(r.periodos).toHaveLength(14);
    expect(r.periodos[1]).toEqual({
      periodo: '2026-09-15',
      totalSegundos: 1800,
      porAsesor: [{ asesorId: ana.toString(), segundos: 1800 }],
    });
    expect(r.periodos[0]).toEqual({ periodo: '2026-09-14', totalSegundos: 0, porAsesor: [] });
    expect(r.asesores).toEqual([{ asesorId: ana.toString(), nombre: 'Ana', totalSegundos: 1800 }]);
  });

  it('por semana empieza en lunes; por mes en el día 1', async () => {
    const ana = await crearAsesor(tenantId, 'Ana');
    await cubeta(tenantId, ana, '2026-09-15T10:00:00Z', 100); // semana del 14
    await cubeta(tenantId, ana, '2026-09-20T10:00:00Z', 200); // domingo, misma semana
    await cubeta(tenantId, ana, '2026-09-21T10:00:00Z', 300); // lunes siguiente

    const semanas = await getAdvisorActivity(tenantId.toString(), query({ ...rango, granularidad: 'semana' }), NOW);
    expect(semanas.periodos.map((p) => [p.periodo, p.totalSegundos])).toEqual([
      ['2026-09-14', 300],
      ['2026-09-21', 300],
    ]);

    const meses = await getAdvisorActivity(tenantId.toString(), query({ ...rango, granularidad: 'mes' }), NOW);
    expect(meses.periodos.map((p) => [p.periodo, p.totalSegundos])).toEqual([['2026-09-01', 600]]);
  });

  it('la zona mueve la cubeta al día local que le corresponde', async () => {
    const ana = await crearAsesor(tenantId, 'Ana');
    // 03:00 UTC del 16 = 22:00 del 15 en Bogotá.
    await cubeta(tenantId, ana, '2026-09-16T03:00:00Z', 900);

    const utc = await getAdvisorActivity(tenantId.toString(), query(rango), NOW);
    expect(utc.periodos.find((p) => p.periodo === '2026-09-16')?.totalSegundos).toBe(900);

    const bogota = await getAdvisorActivity(tenantId.toString(), query({ ...rango, tz: 'America/Bogota' }), NOW);
    expect(bogota.periodos.find((p) => p.periodo === '2026-09-15')?.totalSegundos).toBe(900);
    expect(bogota.periodos.find((p) => p.periodo === '2026-09-16')?.totalSegundos).toBe(0);
  });

  it('con asesorId solo devuelve a ese asesor', async () => {
    const ana = await crearAsesor(tenantId, 'Ana');
    const beto = await crearAsesor(tenantId, 'Beto');
    await cubeta(tenantId, ana, '2026-09-15T10:00:00Z', 100);
    await cubeta(tenantId, beto, '2026-09-15T10:00:00Z', 500);

    const r = await getAdvisorActivity(tenantId.toString(), query({ ...rango, asesorId: beto.toString() }), NOW);
    expect(r.asesores.map((a) => a.nombre)).toEqual(['Beto']);
    expect(r.periodos[1]?.totalSegundos).toBe(500);
  });

  it('asesores ordenados por tiempo total y sin usuarios borrados', async () => {
    const ana = await crearAsesor(tenantId, 'Ana');
    const beto = await crearAsesor(tenantId, 'Beto');
    await cubeta(tenantId, ana, '2026-09-15T10:00:00Z', 100);
    await cubeta(tenantId, beto, '2026-09-15T10:00:00Z', 500);
    await cubeta(tenantId, new Types.ObjectId(), '2026-09-15T10:00:00Z', 999); // usuario borrado

    const r = await getAdvisorActivity(tenantId.toString(), query(rango), NOW);
    expect(r.asesores.map((a) => a.nombre)).toEqual(['Beto', 'Ana']);
    expect(r.periodos[1]?.totalSegundos).toBe(600);
  });
});
