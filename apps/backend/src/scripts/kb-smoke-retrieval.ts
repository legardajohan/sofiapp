/**
 * Smoke test del RAG (DoD de HU-KB-01): comprueba, contra un Atlas real, que un texto
 * cargado y ya indexado se recupera como contexto relevante para una consulta.
 *
 * Requisitos: Atlas con el índice vectorial creado (create-kb-vector-index.ts) y al menos
 * un KbDocument en estado `indexado`. Usa `GEMINI_API_KEY` para embeder la consulta.
 *
 *   pnpm --filter @sofiapp/api exec tsx --env-file .env \
 *     src/scripts/kb-smoke-retrieval.ts "¿cuánto cuesta el plan pro?"
 *
 * Opcional: fija el tenant con KB_SMOKE_TENANT=<ObjectId>; si no, toma el tenant del
 * último documento indexado.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { KbDocument } from '../features/kb/kb-document.model.js';
import { searchKnowledge } from '../features/kb/kb.retrieval.service.js';
import type { IKbDocument } from '../features/kb/kb.types.js';

async function main(): Promise<void> {
  const query = process.argv[2];
  if (!query) {
    logger.error('Falta la consulta. Uso: tsx src/scripts/kb-smoke-retrieval.ts "<consulta>"');
    process.exit(1);
  }

  await mongoose.connect(env.MONGODB_URI);
  logger.info('Conectado a MongoDB Atlas');

  // Resuelve el tenant: variable de entorno o el último documento indexado.
  let tenantId = process.env['KB_SMOKE_TENANT'];
  if (!tenantId) {
    const doc = await KbDocument.findOne({ estadoIndexacion: 'indexado' })
      .sort({ updatedAt: -1 })
      .lean<IKbDocument & { tenantId: mongoose.Types.ObjectId }>();
    if (!doc) {
      logger.error('No hay ningún KbDocument en estado "indexado". Carga y espera a que indexe primero.');
      await mongoose.disconnect();
      process.exit(1);
    }
    tenantId = doc.tenantId.toString();
  }

  logger.info('Ejecutando searchKnowledge', { tenantId, query });
  const resultados = await searchKnowledge(tenantId, query, env.KB_RETRIEVAL_K);

  if (resultados.length === 0) {
    logger.warn('Sin resultados. Revisa que el índice vectorial esté READY y que el texto sea relevante.');
  } else {
    logger.info(`Top ${resultados.length} fragmentos recuperados:`);
    resultados.forEach((r, i) => {
      const preview = r.texto.length > 160 ? `${r.texto.slice(0, 160)}…` : r.texto;
      // eslint-disable-next-line no-console
      console.log(`\n[${i + 1}] score=${r.score?.toFixed(4) ?? 'n/a'} doc=${r.documentId}\n    ${preview}`);
    });
  }

  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  logger.error('Fallo en el smoke test de recuperación', { error: String(err) });
  process.exit(1);
});
