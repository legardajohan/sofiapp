import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';
import { processKbIndexJob } from '../../workers/kb-index.processor.js';
import { KbDocument } from './kb-document.model.js';
import { KbChunk } from './kb-chunk.model.js';
import { createScoped, findScoped } from '../../repositories/base.repository.js';
import type { ILlmProvider } from '../../integrations/llm/llm-provider.types.js';
import type { IKbDocument, IKbChunk } from './kb.types.js';

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function makeProvider(): ILlmProvider {
  return {
    generateReply: vi.fn(),
    extractSlots: vi.fn(),
    classifyLead: vi.fn(),
    embedTexts: vi.fn(({ texts }: { texts: string[] }) =>
      Promise.resolve({ result: texts.map(() => [0.1, 0.2, 0.3]), usage: ZERO_USAGE }),
    ),
  };
}

/**
 * Provider cuyo `embedTexts` ejecuta `sideEffect` antes de resolver: simula que el documento cambia
 * mientras el worker espera a Gemini, que es exactamente la ventana de carrera de HU-KB-06.
 */
function makeProviderQue(sideEffect: () => Promise<void>): ILlmProvider {
  const provider = makeProvider();
  vi.mocked(provider.embedTexts).mockImplementation(async ({ texts }: { texts: string[] }) => {
    await sideEffect();
    return { result: texts.map(() => [0.1, 0.2, 0.3]), usage: ZERO_USAGE };
  });
  return provider;
}

async function seedDoc(tenantId: Types.ObjectId, contenido: string, version = 1): Promise<Types.ObjectId> {
  const doc = await createScoped(KbDocument, tenantId, {
    titulo: 'Doc',
    contenido,
    version,
    estadoIndexacion: 'pendiente',
    chunkCount: 0,
  });
  return doc._id;
}

describe('processKbIndexJob', () => {
  it('trocea, genera embeddings y persiste chunks scoped → estado indexado', async () => {
    const tenantId = new Types.ObjectId();
    const provider = makeProvider();
    const documentId = await seedDoc(tenantId, 'Un contenido corto de prueba.');

    await processKbIndexJob(
      { tenantId: tenantId.toString(), documentId: documentId.toString(), version: 1 },
      provider,
    );

    const doc = await KbDocument.findById(documentId).lean<IKbDocument>();
    expect(doc?.estadoIndexacion).toBe('indexado');
    expect(doc?.chunkCount).toBe(1);

    const chunks = await findScoped(KbChunk, tenantId, { documentId }).lean<IKbChunk[]>().exec();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.tenantId.toString()).toBe(tenantId.toString());
    expect(chunks[0]?.embedding.length).toBeGreaterThan(0);
    expect(provider.embedTexts).toHaveBeenCalledWith({
      texts: ['Un contenido corto de prueba.'],
      taskType: 'RETRIEVAL_DOCUMENT',
    });
  });

  it('reindexar el mismo documento reemplaza los chunks (no duplica)', async () => {
    const tenantId = new Types.ObjectId();
    const provider = makeProvider();
    const documentId = await seedDoc(tenantId, 'Contenido original.');

    const job = { tenantId: tenantId.toString(), documentId: documentId.toString(), version: 1 };
    await processKbIndexJob(job, provider);
    await processKbIndexJob(job, provider);

    const chunks = await findScoped(KbChunk, tenantId, { documentId }).exec();
    expect(chunks).toHaveLength(1); // reemplazo, no acumulación
  });

  it('versión obsoleta → se omite sin tocar el documento', async () => {
    const tenantId = new Types.ObjectId();
    const provider = makeProvider();
    const documentId = await seedDoc(tenantId, 'Contenido.', 2); // doc en versión 2

    await processKbIndexJob(
      { tenantId: tenantId.toString(), documentId: documentId.toString(), version: 1 }, // job viejo
      provider,
    );

    const doc = await KbDocument.findById(documentId).lean<IKbDocument>();
    expect(doc?.estadoIndexacion).toBe('pendiente');
    expect(provider.embedTexts).not.toHaveBeenCalled();
  });

  it('error del provider → estado fallido con mensaje y re-lanza', async () => {
    const tenantId = new Types.ObjectId();
    const provider = makeProvider();
    vi.mocked(provider.embedTexts).mockRejectedValueOnce(new Error('gemini caído'));
    const documentId = await seedDoc(tenantId, 'Contenido que falla.');

    await expect(
      processKbIndexJob(
        { tenantId: tenantId.toString(), documentId: documentId.toString(), version: 1 },
        provider,
      ),
    ).rejects.toThrow('gemini caído');

    const doc = await KbDocument.findById(documentId).lean<IKbDocument>();
    expect(doc?.estadoIndexacion).toBe('fallido');
    expect(doc?.error).toBe('Ocurrió un error al procesar el contenido. Intenta de nuevo más tarde.');
  });

  it('documento eliminado durante el embedding → no crea chunks huérfanos (HU-KB-06)', async () => {
    const tenantId = new Types.ObjectId();
    const documentId = await seedDoc(tenantId, 'Contenido que se borra a mitad.');
    // El borrado ocurre DENTRO de embedTexts: reproduce la ventana real entre la llamada lenta a
    // Gemini y la escritura de los chunks.
    const provider = makeProviderQue(async () => {
      await KbDocument.deleteOne({ _id: documentId });
    });

    await processKbIndexJob(
      { tenantId: tenantId.toString(), documentId: documentId.toString(), version: 1 },
      provider,
    );

    const chunks = await findScoped(KbChunk, tenantId, { documentId }).exec();
    expect(chunks).toHaveLength(0);
  });

  it('documento ocultado durante el embedding → no crea chunks (HU-KB-06)', async () => {
    const tenantId = new Types.ObjectId();
    const documentId = await seedDoc(tenantId, 'Contenido de un preset que se elimina.');
    const provider = makeProviderQue(async () => {
      await KbDocument.updateOne({ _id: documentId }, { $set: { oculto: true } });
    });

    await processKbIndexJob(
      { tenantId: tenantId.toString(), documentId: documentId.toString(), version: 1 },
      provider,
    );

    const chunks = await findScoped(KbChunk, tenantId, { documentId }).exec();
    expect(chunks).toHaveLength(0);

    const doc = await KbDocument.findById(documentId).lean<IKbDocument>();
    expect(doc?.estadoIndexacion).not.toBe('indexado');
  });

  it('documento re-versionado durante el embedding → descarta el job sin pisar el estado (HU-KB-06)', async () => {
    const tenantId = new Types.ObjectId();
    const documentId = await seedDoc(tenantId, 'Contenido que se edita a mitad.');
    const provider = makeProviderQue(async () => {
      await KbDocument.updateOne({ _id: documentId }, { $inc: { version: 1 } });
    });

    await processKbIndexJob(
      { tenantId: tenantId.toString(), documentId: documentId.toString(), version: 1 },
      provider,
    );

    const chunks = await findScoped(KbChunk, tenantId, { documentId }).exec();
    expect(chunks).toHaveLength(0);

    // El job de la versión 2 es el dueño legítimo del estado: este no lo marca como indexado.
    const doc = await KbDocument.findById(documentId).lean<IKbDocument>();
    expect(doc?.estadoIndexacion).not.toBe('indexado');
  });

  it('chunks de tenantA no son visibles para tenantB', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const provider = makeProvider();
    const documentId = await seedDoc(tenantA, 'Contenido de A.');

    await processKbIndexJob(
      { tenantId: tenantA.toString(), documentId: documentId.toString(), version: 1 },
      provider,
    );

    const chunksB = await findScoped(KbChunk, tenantB).exec();
    expect(chunksB).toHaveLength(0);
  });
});
