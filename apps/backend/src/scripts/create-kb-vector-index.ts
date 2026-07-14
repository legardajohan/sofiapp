/**
 * Crea (idempotente) el índice de MongoDB Atlas Vector Search para `kb_chunks`.
 *
 * `tenantId` y `version` se declaran como campos de FILTRO: sin ellos `$vectorSearch`
 * no puede aislar por tenant. Ejecutar una vez por entorno (requiere Atlas M10+; no
 * funciona en Mongo local ni en mongodb-memory-server).
 *
 *   pnpm --filter backend exec tsx --env-file .env src/scripts/create-kb-vector-index.ts
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { KbChunk } from '../features/kb/kb-chunk.model.js';

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  logger.info('Conectado a MongoDB para crear el índice vectorial');

  const definition = {
    fields: [
      {
        type: 'vector',
        path: 'embedding',
        numDimensions: env.KB_EMBED_DIM,
        similarity: 'cosine',
      },
      { type: 'filter', path: 'tenantId' },
      { type: 'filter', path: 'version' },
    ],
  };

  const existing = (await KbChunk.listSearchIndexes()) as Array<{ name: string }>;
  if (existing.some((idx) => idx.name === env.KB_VECTOR_INDEX)) {
    logger.info(`El índice vectorial "${env.KB_VECTOR_INDEX}" ya existe. Nada que hacer.`);
  } else {
    await KbChunk.createSearchIndex({
      name: env.KB_VECTOR_INDEX,
      type: 'vectorSearch',
      definition,
    });
    logger.info(`Índice vectorial "${env.KB_VECTOR_INDEX}" creado.`);
  }

  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  logger.error('Fallo al crear el índice vectorial', { error: String(err) });
  process.exit(1);
});
