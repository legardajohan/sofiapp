/**
 * Migración HU-OMNI-06: `Message.tipo` del enum en inglés al enum en español.
 *
 * `text→texto`, `image→imagen`, `document→documento`, `template→plantilla`, `other→otro`.
 * `audio` se escribe igual en los dos idiomas, así que no hay nada que migrar en él.
 *
 * Idempotente: el filtro `{ tipo: 'text' }` no encuentra nada tras la primera corrida, así que
 * repetirla es un no-op y no hay riesgo en lanzarla dos veces.
 *
 * Uso:
 *   pnpm --filter @sofiapp/api migrate:tipo-mensaje -- --dry-run   (solo informa, no escribe)
 *   pnpm --filter @sofiapp/api migrate:tipo-mensaje
 *
 * Correr en la fase `migrate` del despliegue: con el backend nuevo ya arriba (escribe en español y
 * lee ambos) y ANTES de la fase `contract`, que retira los valores legacy del enum del schema.
 *
 * **Cross-tenant a propósito.** Es mantenimiento de datos fuera del camino HTTP, igual que los
 * demás `migrate-*` de esta carpeta: no hay `req.user` del que sacar un `tenantId` y la migración
 * tiene que alcanzar todas las empresas. No es una infracción del aislamiento, es la excepción que
 * ya tienen los scripts de mantenimiento.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { Message } from '../features/message/message.model.js';
import { TIPO_MENSAJE_LEGACY } from '../features/message/message.types.js';

/**
 * Migra los tipos y devuelve cuántos mensajes se tocaron (o se tocarían, en simulación).
 *
 * Separada de `main` para poder testearla contra la base en memoria sin que abra ni cierre la
 * conexión por su cuenta — mismo patrón que `migrarPlantillaChatGlobal`.
 */
export async function migrarTiposMensaje(dryRun = false): Promise<number> {
  let total = 0;

  for (const [viejo, nuevo] of Object.entries(TIPO_MENSAJE_LEGACY)) {
    // `audio → audio`: nada que hacer, y un `updateMany` sobre él tocaría todos los mensajes de
    // audio del sistema para dejarlos exactamente igual.
    if (viejo === nuevo) continue;

    // Por la colección cruda y no por el modelo: Mongoose castea y valida contra el schema, y en la
    // fase `contract` el enum ya no conocerá `text`, con lo que el update se volvería un no-op
    // silencioso. Mismo motivo por el que `migrate-cliente-tags.ts` usa `.collection`.
    const pendientes = await Message.collection.countDocuments({ tipo: viejo });
    if (pendientes === 0) continue;

    if (dryRun) {
      logger.info('Migración de tipos (simulación).', { viejo, nuevo, pendientes });
      total += pendientes;
      continue;
    }

    const res = await Message.collection.updateMany({ tipo: viejo }, { $set: { tipo: nuevo } });
    logger.info('Tipo de mensaje migrado.', { viejo, nuevo, modificados: res.modifiedCount });
    total += res.modifiedCount;
  }

  return total;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    const total = await migrarTiposMensaje(dryRun);

    if (total === 0) {
      logger.info('Migración de tipos: no hay mensajes con el enum anterior.');
      return;
    }

    logger.info(
      dryRun ? 'Migración de tipos: simulación completada.' : 'Migración de tipos completada.',
      { mensajes: total },
    );
  } finally {
    await mongoose.disconnect();
  }
}

// Solo corre como script; importarlo desde un test no dispara la migración.
if (process.argv[1]?.includes('migrate-tipo-mensaje')) {
  main().catch((err: unknown) => {
    logger.error('Migración de tipos de mensaje fallida.', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
