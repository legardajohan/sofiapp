/**
 * Migración HU-CRM-04: rellena `Lead.semaforo` desde la etiqueta de semáforo de su conversación.
 *
 * Antes de este feature el semáforo de un lead no era suyo: se leía de las etiquetas de sistema
 * aplicadas a `Cliente.tagIds` (HU-OMNI-04). Al pasar a ser un campo del lead, lo que los usuarios
 * ya habían clasificado desde la bandeja se quedaría fuera del listado — la columna Semáforo
 * aparecería vacía de golpe para todos. Este script traslada esa clasificación.
 *
 * Idempotente: solo escribe donde `semaforo` es `null` o no existe, así que volver a correrlo no
 * pisa una clasificación hecha a mano después.
 *
 * Si una conversación lleva varias etiquetas de semáforo —nada en el modelo lo impedía— gana la
 * última de `tagIds`, que es el mismo criterio que usaba el listado ("la aplicada más
 * recientemente primero").
 *
 * Uso:
 *   pnpm --filter @sofiapp/api exec tsx --env-file .env src/scripts/backfill-lead-semaforo.ts --dry-run
 *   pnpm --filter @sofiapp/api exec tsx --env-file .env src/scripts/backfill-lead-semaforo.ts
 *
 * Correr ANTES de desplegar el frontend, que ya no lee `semaforos`.
 */
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { Lead } from '../features/lead/lead.model.js';
import { Tag } from '../features/tag/tag.model.js';

interface LeadPendiente {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  clienteId: Types.ObjectId;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    const pendientes = (await Lead.collection
      .find(
        { $or: [{ semaforo: null }, { semaforo: { $exists: false } }] },
        { projection: { tenantId: 1, clienteId: 1 } },
      )
      .toArray()) as unknown as LeadPendiente[];

    if (pendientes.length === 0) {
      logger.info('Backfill de semáforo: no hay leads sin clasificar que migrar.');
      return;
    }

    // Un solo mapa `tagId → slug` para todo el proceso: las etiquetas de semáforo son cuatro por
    // tenant como mucho, así que traerlas de golpe es más barato que una consulta por lead.
    const tags = (await Tag.collection
      .find({ semaforo: { $exists: true } }, { projection: { semaforo: 1 } })
      .toArray()) as unknown as { _id: Types.ObjectId; semaforo: string }[];

    const slugPorTag = new Map(tags.map((t) => [String(t._id), t.semaforo]));

    const clientes = (await Cliente.collection
      .find(
        { _id: { $in: pendientes.map((l) => l.clienteId) } },
        { projection: { tagIds: 1 } },
      )
      .toArray()) as unknown as { _id: Types.ObjectId; tagIds?: Types.ObjectId[] }[];

    const tagIdsPorCliente = new Map(clientes.map((c) => [String(c._id), c.tagIds ?? []]));

    const conteo = new Map<string, number>();
    let migrados = 0;

    for (const lead of pendientes) {
      const tagIds = tagIdsPorCliente.get(String(lead.clienteId)) ?? [];

      // La última del array es la aplicada más recientemente: mismo criterio que el listado.
      const slug = [...tagIds]
        .reverse()
        .map((id) => slugPorTag.get(String(id)))
        .find((s): s is string => Boolean(s));

      if (!slug) continue;

      conteo.set(slug, (conteo.get(slug) ?? 0) + 1);
      migrados += 1;

      if (!dryRun) {
        await Lead.collection.updateOne({ _id: lead._id }, { $set: { semaforo: slug } });
      }
    }

    logger.info(dryRun ? 'Backfill de semáforo (simulacro, sin escribir).' : 'Backfill de semáforo completado.', {
      leadsSinClasificar: pendientes.length,
      migrados,
      porSemaforo: Object.fromEntries(conteo),
    });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error('Backfill de semáforo fallido.', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
