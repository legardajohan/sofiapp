import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { crearAsesor } from '../reports/reports.fixtures.js';
import { ActividadAsesor, ActividadCursor } from './activity.model.js';
import { registrarLatido } from './activity.service.js';

/*
 * Invariante multi-tenant de HU-REP-06 (docs/multi-tenancy.md §8): un latido solo escribe en su
 * propio tenant, y el cursor que serializa las pestañas es por tenant y usuario.
 */

describe('HU-REP-06 — aislamiento de los latidos', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();
  const ahora = new Date('2026-09-15T10:30:00Z');

  it('un latido de A no crea ni modifica cubetas ni cursores de B', async () => {
    const asesorA = await crearAsesor(tenantA, 'Ana');
    const asesorB = await crearAsesor(tenantB, 'Beto');
    await registrarLatido(tenantB.toString(), asesorB.toString(), ahora);
    const antesB = await ActividadAsesor.find({ tenantId: tenantB }).lean();

    await registrarLatido(tenantA.toString(), asesorA.toString(), new Date(ahora.getTime() + 60_000));

    expect(await ActividadAsesor.find({ tenantId: tenantB }).lean()).toEqual(antesB);
    expect(await ActividadAsesor.countDocuments({ tenantId: tenantA })).toBe(1);
    expect(await ActividadCursor.countDocuments({ tenantId: tenantA })).toBe(1);
    expect(await ActividadCursor.countDocuments({ tenantId: tenantB })).toBe(1);
  });

  it('un usuario de A latiendo con el tenant de B no acredita nada en ninguno', async () => {
    const asesorA = await crearAsesor(tenantA, 'Ana');
    await registrarLatido(tenantB.toString(), asesorA.toString(), ahora);
    expect(await ActividadAsesor.countDocuments({})).toBe(0);
    expect(await ActividadCursor.countDocuments({})).toBe(0);
  });

  it('el cursor de A no adelanta el crédito de B aunque sea el mismo userId', async () => {
    // Defensa en profundidad: aunque un `_id` colisionara entre tenants, cada cursor es del suyo.
    const asesor = await crearAsesor(tenantA, 'Ana');
    await registrarLatido(tenantA.toString(), asesor.toString(), ahora);
    await ActividadCursor.collection.insertOne({ tenantId: tenantB, userId: asesor, ultimoLatido: ahora });
    await registrarLatido(tenantA.toString(), asesor.toString(), new Date(ahora.getTime() + 60_000));
    const totalA = (await ActividadAsesor.find({ tenantId: tenantA }).lean()).reduce((t, c) => t + c.segundosActivos, 0);
    expect(totalA).toBe(120);
  });
});
