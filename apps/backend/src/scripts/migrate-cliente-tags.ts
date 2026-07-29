/**
 * Migración HU-OMNI-04: `Cliente.tags: [String]` (texto libre) → `Cliente.tagIds: [ObjectId]`.
 *
 * Por cada tenant: recolecta los strings distintos, crea un `Tag` por cada uno, rellena `tagIds`
 * y elimina el campo viejo. Idempotente — al terminar ya no quedan documentos con `tags`, así que
 * una segunda corrida no encuentra nada que hacer.
 *
 * Uso:
 *   pnpm --filter @sofiapp/api migrate:tags -- --dry-run   (solo informa, no escribe)
 *   pnpm --filter @sofiapp/api migrate:tags
 *
 * Correr ANTES de desplegar el frontend, que ya no lee `tags`.
 */
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { Tag } from '../features/tag/tag.model.js';

/** Paleta de respaldo para las etiquetas migradas: el campo viejo no guardaba color. */
const PALETA = ['#2563EB', '#DC2626', '#EA580C', '#16A34A', '#7C3AED', '#0891B2', '#CA8A04'];

interface ClienteConTagsViejos {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  tags?: string[];
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    // `tags` ya no está en el schema, así que se lee por la colección cruda.
    const docs = (await Cliente.collection
      .find({ tags: { $exists: true, $ne: [] } }, { projection: { tenantId: 1, tags: 1 } })
      .toArray()) as unknown as ClienteConTagsViejos[];

    if (docs.length === 0) {
      logger.info('Migración de etiquetas: no hay clientes con `tags` que migrar.');
      return;
    }

    // tenantId → (nombre normalizado → nombre original)
    const porTenant = new Map<string, Map<string, string>>();
    for (const doc of docs) {
      const clave = String(doc.tenantId);
      const nombres = porTenant.get(clave) ?? new Map<string, string>();
      for (const raw of doc.tags ?? []) {
        const nombre = raw.trim().slice(0, 30);
        if (nombre) nombres.set(nombre.toLocaleLowerCase('es'), nombre);
      }
      porTenant.set(clave, nombres);
    }

    const totalEtiquetas = [...porTenant.values()].reduce((n, m) => n + m.size, 0);
    logger.info('Migración de etiquetas: alcance calculado.', {
      clientes: docs.length,
      tenants: porTenant.size,
      etiquetasDistintas: totalEtiquetas,
      dryRun,
    });

    if (dryRun) {
      for (const [tenantId, nombres] of porTenant) {
        logger.info(`  tenant ${tenantId}: ${[...nombres.values()].join(', ')}`);
      }
      logger.info('Dry-run: no se escribió nada.');
      return;
    }

    // Un `Tag` por nombre distinto y tenant. `$setOnInsert` respeta los que ya existan.
    const idsPorTenant = new Map<string, Map<string, Types.ObjectId>>();
    for (const [tenantId, nombres] of porTenant) {
      const oid = new Types.ObjectId(tenantId);
      const mapa = new Map<string, Types.ObjectId>();
      let i = 0;
      for (const [clave, nombre] of nombres) {
        await Tag.updateOne(
          { tenantId: oid, nombre },
          { $setOnInsert: { tenantId: oid, nombre, color: PALETA[i % PALETA.length] } },
          { upsert: true, collation: { locale: 'es', strength: 2 } },
        );
        const tag = await Tag.findOne({ tenantId: oid, nombre })
          .collation({ locale: 'es', strength: 2 })
          .lean();
        if (tag) mapa.set(clave, tag._id as Types.ObjectId);
        i += 1;
      }
      idsPorTenant.set(tenantId, mapa);
    }

    let migrados = 0;
    for (const doc of docs) {
      const mapa = idsPorTenant.get(String(doc.tenantId));
      if (!mapa) continue;
      const tagIds = [
        ...new Set(
          (doc.tags ?? [])
            .map((raw) => mapa.get(raw.trim().slice(0, 30).toLocaleLowerCase('es')))
            .filter((id): id is Types.ObjectId => id !== undefined)
            .map((id) => String(id)),
        ),
      ].map((id) => new Types.ObjectId(id));

      await Cliente.collection.updateOne(
        { _id: doc._id },
        { $set: { tagIds }, $unset: { tags: '' } },
      );
      migrados += 1;
    }

    logger.info('Migración de etiquetas completada.', { clientes: migrados, etiquetas: totalEtiquetas });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error('Migración de etiquetas fallida.', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
