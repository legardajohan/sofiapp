import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Estado } from './estado.model.js';
import { createEstado, existeEstado, listEstados } from './estado.service.js';
import { seedEstados } from '../../seed/seed-estados.js';

/**
 * Aislamiento multi-tenant del catálogo de estados (HU-CRM-03). El pipeline es dato del tenant: si
 * una empresa viera —o peor, pudiera filtrar por— las etapas de otra, sabría cómo vende su
 * competencia.
 */
describe('HU-CRM-03 — aislamiento multi-tenant del catálogo de estados', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();

  beforeEach(async () => {
    await Estado.deleteMany({});
    await Estado.syncIndexes();
    await seedEstados(tenantA);
    await seedEstados(tenantB);
  });

  it('`listEstados` del tenant B no devuelve ningún estado del tenant A', async () => {
    await createEstado(tenantA.toString(), { label: 'Visita agendada' });

    const listadoB = await listEstados(tenantB.toString());

    expect(listadoB.map((e) => e.key)).not.toContain('visita-agendada');
    // Solo los cinco de fábrica, que son suyos propios y no los de A.
    expect(listadoB).toHaveLength(5);

    const idsA = (await listEstados(tenantA.toString())).map((e) => e.id);
    expect(listadoB.every((e) => !idsA.includes(e.id))).toBe(true);
  });

  it('un estado del tenant A no existe para el tenant B', async () => {
    await createEstado(tenantA.toString(), { label: 'Visita agendada' });

    expect(await existeEstado(tenantA.toString(), 'visita-agendada')).toBe(true);
    expect(await existeEstado(tenantB.toString(), 'visita-agendada')).toBe(false);
  });

  it('el mismo nombre en dos tenants convive: la unicidad es por empresa', async () => {
    const a = await createEstado(tenantA.toString(), { label: 'Visita agendada' });
    const b = await createEstado(tenantB.toString(), { label: 'Visita agendada' });

    // Misma clave legible, documentos distintos: el índice único es { tenantId, key }.
    expect(a.key).toBe(b.key);
    expect(a.id).not.toBe(b.id);
  });
});
