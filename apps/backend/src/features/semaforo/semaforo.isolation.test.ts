import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { seedSemaforos } from '../../seed/seed-semaforos.js';
import { Semaforo } from './semaforo.model.js';
import { createSemaforo, listSemaforos, updateSemaforo } from './semaforo.service.js';
import type { ISemaforo } from './semaforo.types.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

describe('HU-CRM-04 — aislamiento multi-tenant del catálogo de semáforos', () => {
  let propioDeA: string;

  beforeEach(async () => {
    await Semaforo.deleteMany({});
    await Semaforo.syncIndexes();

    await seedSemaforos(tenantA);
    await seedSemaforos(tenantB);

    const creado = await createSemaforo(tenantA, { label: 'Tibio', color: '#CA8A04' });
    propioDeA = creado.id;
  });

  it('el catálogo del tenantB no incluye el semáforo propio del tenantA', async () => {
    const catalogoB = await listSemaforos(tenantB);
    expect(catalogoB.map((s) => s.key)).toEqual(['azul', 'naranja', 'verde', 'rojo']);

    // Su dueño sí lo ve: el vacío de arriba es aislamiento, no un catálogo roto.
    const catalogoA = await listSemaforos(tenantA);
    expect(catalogoA.map((s) => s.key)).toContain('tibio');
  });

  it('el tenantB no puede editar un semáforo del tenantA → 404 y NO lo toca', async () => {
    await expect(updateSemaforo(tenantB, propioDeA, { label: 'Secuestrado' })).rejects.toMatchObject(
      { statusCode: 404 },
    );

    // El 404 no basta: hay que probar que no escribió. Un 403 confirmaría que existe en otra empresa.
    const intacto = await findByIdScoped(Semaforo, tenantA, propioDeA).lean<ISemaforo>();
    expect(intacto?.label).toBe('Tibio');
  });

  it('la misma clave coexiste en dos tenants: la unicidad es por tenant, no global', async () => {
    const enB = await createSemaforo(tenantB, { label: 'Tibio' });

    expect(enB.key).toBe('tibio');
    expect(enB.id).not.toBe(propioDeA);
  });

  it('`createScoped` fuerza el tenant del argumento sobre el que venga en el payload', async () => {
    const doc = await createScoped(Semaforo, tenantA, {
      tenantId: tenantB,
      key: 'colado',
      label: 'Colado',
      color: '#475569',
      orden: 99,
      activo: true,
      esDefecto: false,
    });

    expect(String(doc.tenantId)).toBe(tenantA.toString());
  });
});
