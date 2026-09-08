import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Estado } from '../features/estado/estado.model.js';
import { Tenant } from '../features/tenant/tenant.model.js';
import { listEstados } from '../features/estado/estado.service.js';
import { ESTADOS_DEFECTO, backfillEstadoDeclinado, seedEstados } from './seed-estados.js';

/** Un tenant mínimo: solo lo que el schema exige, que es lo que estos tests necesitan. */
async function crearTenant(slug: string): Promise<Types.ObjectId> {
  const doc = await Tenant.create({
    nombre: `Empresa ${slug}`,
    slug,
    contacto: { email: `${slug}@empresa.test`, telefono: '3001234567' },
  });
  return doc._id as Types.ObjectId;
}

describe('HU-PIPE-01 — la etapa «Declinado» llega a todos los tenants', () => {
  beforeEach(async () => {
    await Estado.deleteMany({});
    await Tenant.deleteMany({});
    await Estado.syncIndexes();
  });

  it('un tenant nuevo la recibe en la siembra, al final del pipeline', async () => {
    const tenant = await crearTenant('nueva');

    await seedEstados(tenant);
    const estados = await listEstados(tenant.toString());

    expect(estados.at(-1)?.key).toBe('declinado');
    expect(estados.at(-1)?.label).toBe('Declinado');
    expect(estados.at(-1)?.esSalida).toBe(true);
  });

  it('un tenant ANTERIOR al feature la recibe por backfill dirigido', async () => {
    // Reproduce el estado real de producción: catálogo de cinco y `estadosSeeded: true`, que es
    // justo lo que hace que `seedEstados` salga antes de tiempo y no baste para esto.
    const tenant = await crearTenant('vieja');
    for (const [orden, estado] of ESTADOS_DEFECTO.filter((e) => e.key !== 'declinado').entries()) {
      await Estado.create({
        tenantId: tenant,
        key: estado.key,
        label: estado.label,
        color: estado.color,
        orden,
        activo: true,
        esDefecto: true,
      });
    }
    await Tenant.updateOne({ _id: tenant }, { $set: { estadosSeeded: true } });

    await backfillEstadoDeclinado();

    const estados = await listEstados(tenant.toString());
    expect(estados.map((e) => e.key)).toContain('declinado');
    // Al final del pipeline de ESE tenant, no en una posición fija.
    expect(estados.at(-1)?.key).toBe('declinado');
  });

  it('marca como salida las etapas terminales antiguas, que no traían el campo', async () => {
    const tenant = await crearTenant('vieja-salida');
    await Estado.collection.insertOne({
      tenantId: tenant,
      key: 'perdido',
      label: 'Perdido',
      color: '#DC2626',
      orden: 4,
      activo: true,
      esDefecto: true,
      // Sin `esSalida`: así están los documentos sembrados antes de HU-PIPE-01.
    });

    await backfillEstadoDeclinado();

    const perdido = (await listEstados(tenant.toString())).find((e) => e.key === 'perdido');
    expect(perdido?.esSalida).toBe(true);
  });

  it('es idempotente: dos corridas seguidas no duplican la etapa', async () => {
    const tenant = await crearTenant('idempotente');
    await seedEstados(tenant);

    await backfillEstadoDeclinado();
    await backfillEstadoDeclinado();

    const declinados = (await listEstados(tenant.toString())).filter(
      (e) => e.key === 'declinado',
    );
    expect(declinados).toHaveLength(1);
  });

  it('NO pisa el renombrado ni el recoloreado del administrador', async () => {
    const tenant = await crearTenant('renombrada');
    await seedEstados(tenant);
    await Estado.updateOne(
      { tenantId: tenant, key: 'declinado' },
      { $set: { label: 'No le interesó', color: '#7C3AED' } },
    );

    await backfillEstadoDeclinado();

    const declinado = (await listEstados(tenant.toString())).find((e) => e.key === 'declinado');
    expect(declinado?.label).toBe('No le interesó');
    expect(declinado?.color).toBe('#7C3AED');
  });

  it('no toca un tenant que aún no tiene catálogo: eso es trabajo de la siembra completa', async () => {
    // Insertarle solo «Declinado» lo dejaría con una etapa y sin las otras cinco.
    const tenant = await crearTenant('sin-catalogo');

    await backfillEstadoDeclinado();

    expect(await listEstados(tenant.toString())).toHaveLength(0);
  });

  it('cada tenant recibe la suya: la etapa no se comparte entre empresas', async () => {
    const a = await crearTenant('empresa-a');
    const b = await crearTenant('empresa-b');
    await seedEstados(a);
    await seedEstados(b);

    const declinadoA = (await listEstados(a.toString())).find((e) => e.key === 'declinado');
    const declinadoB = (await listEstados(b.toString())).find((e) => e.key === 'declinado');

    expect(declinadoA?.id).not.toBe(declinadoB?.id);
  });
});
