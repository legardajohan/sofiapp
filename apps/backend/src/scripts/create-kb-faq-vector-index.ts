/**
 * Crea (idempotente) el índice de MongoDB Atlas Vector Search para `kbfaqs`.
 *
 * `tenantId` y `activo` se declaran como campos de FILTRO: sin `tenantId` el
 * `$vectorSearch` no puede aislar por tenant, y sin `activo` una FAQ desactivada
 * podría seguir respondiendo. Ejecutar una vez por entorno (requiere Atlas M10+;
 * no funciona en Mongo local ni en mongodb-memory-server).
 *
 * Mientras el índice no exista, `matchFaq` degrada a `{ matched: false }` y el
 * sistema responde por el flujo normal (RAG + LLM), sin ahorro de tokens.
 *
 *   pnpm --filter @sofiapp/api exec tsx --env-file .env src/scripts/create-kb-faq-vector-index.ts
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { KbFaq } from '../features/kb-faq/kb-faq.model.js';

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  logger.info('Conectado a MongoDB para crear el índice vectorial de FAQs');

  const definition = {
    fields: [
      {
        type: 'vector',
        path: 'embedding',
        numDimensions: env.KB_EMBED_DIM,
        similarity: 'cosine',
      },
      { type: 'filter', path: 'tenantId' },
      { type: 'filter', path: 'activo' },
    ],
  };

  const existing = (await KbFaq.listSearchIndexes()) as Array<{ name: string }>;
  if (existing.some((idx) => idx.name === env.FAQ_VECTOR_INDEX)) {
    logger.info(`El índice vectorial "${env.FAQ_VECTOR_INDEX}" ya existe. Nada que hacer.`);
  } else {
    await KbFaq.createSearchIndex({
      name: env.FAQ_VECTOR_INDEX,
      type: 'vectorSearch',
      definition,
    });
    logger.info(`Índice vectorial "${env.FAQ_VECTOR_INDEX}" creado.`);
  }

  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  logger.error('Fallo al crear el índice vectorial de FAQs', { error: String(err) });
  process.exit(1);
});
