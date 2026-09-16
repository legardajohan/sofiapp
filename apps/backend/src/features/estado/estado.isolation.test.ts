import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Estado } from './estado.model.js';
import { Lead } from '../lead/lead.model.js';
import { createScoped } from '../../repositories/base.repository.js';
import {
  createEstado,
  deleteEstado,
  existeEstado,
  listEstados,
  reordenarEstados,
  updateEstado,
} from './estado.service.js';
import { ESTADOS_DEFECTO, seedEstados } from '../../seed/seed-estados.js';

/** Un lead del tenant indicado en esa etapa. Solo importa su `estado`; el resto es obligatorio. */
async function crearLeadEn(
  tenantId: Types.ObjectId,
  estado: string,
  telefono: string,
): Promise<void> {
  const actor = new Types.ObjectId();
  await createScoped(Lead, tenantId, {
    nombre: `Lead ${telefono}`,
    telefono,
    clienteId: new Types.ObjectId(),
    estado,
    responsableId: actor,
    origen: {
      tipo: 'conversacion',
      conversacionId: new Types.ObjectId(),
      convertidoPor: actor,
      convertidoAt: new Date(),
    },
  });
}

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
    await Lead.deleteMany({});
    await Estado.syncIndexes();
    await Lead.syncIndexes();
    await seedEstados(tenantA);
    await seedEstados(tenantB);
  });

  it('`listEstados` del tenant B no devuelve ningún estado del tenant A', async () => {
    await createEstado(tenantA.toString(), { label: 'Visita agendada' });

    const listadoB = await listEstados(tenantB.toString());

    expect(listadoB.map((e) => e.key)).not.toContain('visita-agendada');
    // Solo los de fábrica, que son suyos propios y no los de A. Se cuenta contra la semilla y
    // no contra un número escrito a mano: añadir una etapa de fábrica no debe romper este test.
    expect(listadoB).toHaveLength(ESTADOS_DEFECTO.length);

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
  /**
   * El CRUD del catálogo cruza la frontera por dos sitios nuevos: `updateEstado` y `deleteEstado`
   * reciben un `id` del cliente —lo único del request que no nace del token— y el borrado además
   * consulta la colección `leads` para decidir. Los tres caminos se prueban aquí.
   */
  it('el tenant B no puede renombrar una etapa del tenant A', async () => {
    const deA = await createEstado(tenantA.toString(), { label: 'Visita agendada' });

    await expect(
      updateEstado(tenantB.toString(), deA.id, { label: 'Secuestrada' }),
    ).rejects.toMatchObject({ statusCode: 404 });

    const sigueEnA = (await listEstados(tenantA.toString())).find((e) => e.id === deA.id);
    expect(sigueEnA?.label).toBe('Visita agendada');
  });

  it('el tenant B no puede borrar una etapa del tenant A', async () => {
    const deA = await createEstado(tenantA.toString(), { label: 'Visita agendada' });

    await expect(deleteEstado(tenantB.toString(), deA.id)).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(await existeEstado(tenantA.toString(), 'visita-agendada')).toBe(true);
  });

  it('la cuenta de leads por etapa no suma los leads del otro tenant', async () => {
    // Misma clave de etapa en las dos empresas —la unicidad es por tenant—, así que un conteo sin
    // acotar devolvería 1 para B: es exactamente la fuga que este test cierra.
    await crearLeadEn(tenantA, 'pagado', '573001112233');

    const deB = (await listEstados(tenantB.toString(), { conUso: true })).find(
      (e) => e.key === 'pagado',
    );
    const deA = (await listEstados(tenantA.toString(), { conUso: true })).find(
      (e) => e.key === 'pagado',
    );

    expect(deB?.leads).toBe(0);
    expect(deA?.leads).toBe(1);
  });
  it('el tenant B no puede reordenar el embudo del tenant A', async () => {
    const ordenOriginalA = (await listEstados(tenantA.toString())).map((e) => e.id);

    // B manda los ids de A: para B no son una permutación de SU catálogo, así que se rechaza antes
    // de escribir nada. Sin el filtro por tenant, esto reescribiría el embudo de otra empresa.
    await expect(
      reordenarEstados(tenantB.toString(), [...ordenOriginalA].reverse()),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect((await listEstados(tenantA.toString())).map((e) => e.id)).toEqual(ordenOriginalA);
  });

  it('reordenar en A no toca el orden de B', async () => {
    const ordenB = (await listEstados(tenantB.toString())).map((e) => e.key);

    const idsA = (await listEstados(tenantA.toString())).map((e) => e.id);
    await reordenarEstados(tenantA.toString(), [...idsA].reverse());

    expect((await listEstados(tenantB.toString())).map((e) => e.key)).toEqual(ordenB);
  });
});
