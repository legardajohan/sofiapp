import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  findByIdScoped,
  findOneAndUpdateScoped,
  createScoped,
  deleteManyScoped,
} from '../repositories/base.repository.js';
import { KbDocument } from '../features/kb/kb-document.model.js';
import { KbChunk } from '../features/kb/kb-chunk.model.js';
import { chunkText } from '../features/kb/kb.chunker.js';
import type { IKbDocument } from '../features/kb/kb.types.js';
import type { KbIndexJobData } from '../features/kb/kb.types.js';
import type { ILlmProvider } from '../integrations/llm/llm-provider.types.js';

/**
 * Indexa un KbDocument: trocea → genera embeddings → persiste KbChunk (scoped) →
 * marca el documento como `indexado` (o `fallido`).
 *
 * Idempotente: reemplaza los chunks previos del documento (por `documentId`), así que
 * reprocesar el mismo documento no duplica. Salta si la versión del job quedó obsoleta.
 */
export async function processKbIndexJob(
  data: KbIndexJobData,
  provider: ILlmProvider,
): Promise<void> {
  const { tenantId, documentId, version } = data;

  const doc = await findByIdScoped(KbDocument, tenantId, documentId)
    .lean<IKbDocument | null>()
    .exec();

  if (!doc) {
    logger.warn('kb-index: documento no encontrado', { tenantId, documentId });
    return;
  }
  if (doc.version !== version) {
    logger.info('kb-index: versión obsoleta, se omite', {
      documentId,
      jobVersion: version,
      docVersion: doc.version,
    });
    return;
  }

  await findOneAndUpdateScoped(
    KbDocument,
    tenantId,
    { _id: documentId },
    { $set: { estadoIndexacion: 'procesando' } },
  ).exec();

  try {
    const chunks = chunkText(doc.contenido, env.KB_CHUNK_SIZE, env.KB_CHUNK_OVERLAP);

    // Reemplazo: elimina los chunks de versiones previas de este documento.
    await deleteManyScoped(KbChunk, tenantId, { documentId }).exec();

    if (chunks.length > 0) {
      const { result: embeddings } = await provider.embedTexts({
        texts: chunks,
        taskType: 'RETRIEVAL_DOCUMENT',
      });

      for (let i = 0; i < chunks.length; i++) {
        await createScoped(KbChunk, tenantId, {
          documentId,
          version,
          chunkIndex: i,
          texto: chunks[i],
          embedding: embeddings[i] ?? [],
        });
      }
    }

    await findOneAndUpdateScoped(
      KbDocument,
      tenantId,
      { _id: documentId },
      { $set: { estadoIndexacion: 'indexado', chunkCount: chunks.length }, $unset: { error: 1 } },
    ).exec();

    logger.info('kb-index: documento indexado', { documentId, chunkCount: chunks.length });
  } catch (err) {
    await findOneAndUpdateScoped(
      KbDocument,
      tenantId,
      { _id: documentId },
      { $set: { estadoIndexacion: 'fallido', error: String(err) } },
    ).exec();
    throw err; // deja que BullMQ reintente
  }
}
