import type { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { kbIndexQueue, KB_INDEX_JOB_NAME } from '../../config/queues.js';
import {
  findScoped,
  findOneScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findOneAndDeleteScoped,
  createScoped,
  countScoped,
  deleteManyScoped,
} from '../../repositories/base.repository.js';
import { KbDocument } from './kb-document.model.js';
import { KbChunk } from './kb-chunk.model.js';
import type {
  CreateKbDocumentDTO,
  DeleteKbDocumentResponse,
  IKbDocument,
  IKbDocumentResponse,
  KbDocumentsListResponse,
} from './kb.types.js';

type TenantId = string | Types.ObjectId;

export function mapKbDocumentToResponse(doc: IKbDocument & { _id: Types.ObjectId }): IKbDocumentResponse {
  return {
    id: doc._id.toString(),
    titulo: doc.titulo,
    contenido: doc.contenido,
    estadoIndexacion: doc.estadoIndexacion,
    version: doc.version,
    chunkCount: doc.chunkCount,
    isPreset: doc.isPreset ?? false,
    ...(doc.proposito ? { proposito: doc.proposito } : {}),
    ...(doc.error ? { error: doc.error } : {}),
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

/**
 * Ingesta de texto: crea (o re-versiona) un KbDocument en estado `pendiente` y encola
 * el job `kb-index`. NO trocea ni genera embeddings inline (trabajo pesado → worker).
 */
export async function createDocument(
  tenantId: TenantId,
  dto: CreateKbDocumentDTO,
): Promise<IKbDocumentResponse> {
  const existing = await findOneScoped(KbDocument, tenantId, { titulo: dto.titulo })
    .lean<(IKbDocument & { _id: Types.ObjectId }) | null>()
    .exec();

  let doc: IKbDocument & { _id: Types.ObjectId };

  if (existing) {
    // Re-subida del mismo título → nueva versión + re-indexado.
    const updated = await findOneAndUpdateScoped(
      KbDocument,
      tenantId,
      { _id: existing._id },
      {
        $set: { contenido: dto.contenido, estadoIndexacion: 'pendiente', chunkCount: 0 },
        $inc: { version: 1 },
        $unset: { error: 1 },
      },
      { new: true },
    )
      .lean<(IKbDocument & { _id: Types.ObjectId }) | null>()
      .exec();
    if (!updated) throw new AppError('No se pudo actualizar el documento.', 500);
    doc = updated;
  } else {
    const created = await createScoped(KbDocument, tenantId, {
      titulo: dto.titulo,
      contenido: dto.contenido,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });
    doc = created.toObject() as IKbDocument & { _id: Types.ObjectId };
  }

  await kbIndexQueue.add(KB_INDEX_JOB_NAME, {
    tenantId: tenantId.toString(),
    documentId: doc._id.toString(),
    version: doc.version,
  });

  return mapKbDocumentToResponse(doc);
}

export async function listDocuments(
  tenantId: TenantId,
  page: number,
  limit: number,
): Promise<KbDocumentsListResponse> {
  const [docs, total] = await Promise.all([
    findScoped(KbDocument, tenantId)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<(IKbDocument & { _id: Types.ObjectId })[]>()
      .exec(),
    countScoped(KbDocument, tenantId).exec(),
  ]);

  return {
    data: docs.map(mapKbDocumentToResponse),
    total,
    page,
    limit,
  };
}

/**
 * Edita el contenido de un documento existente: re-versiona, limpia los chunks obsoletos y
 * re-encola el job `kb-index` SOLO si el nuevo contenido no está vacío. Con contenido vacío el
 * documento queda en `pendiente` sin indexar (p. ej. un preset todavía sin llenar).
 */
export async function updateDocument(
  tenantId: TenantId,
  id: string,
  contenido: string,
): Promise<IKbDocumentResponse> {
  const existing = await findByIdScoped(KbDocument, tenantId, id).lean().exec();
  if (!existing) throw new AppError('No se encontró el documento.', 404);

  const updated = await findOneAndUpdateScoped(
    KbDocument,
    tenantId,
    { _id: id },
    {
      $set: { contenido, estadoIndexacion: 'pendiente', chunkCount: 0 },
      $inc: { version: 1 },
      $unset: { error: 1 },
    },
    { new: true },
  )
    .lean<(IKbDocument & { _id: Types.ObjectId }) | null>()
    .exec();
  if (!updated) throw new AppError('No se pudo actualizar el documento.', 500);

  // Los embeddings anteriores ya no corresponden al nuevo texto.
  await deleteManyScoped(KbChunk, tenantId, { documentId: id });

  if (contenido.trim().length > 0) {
    await kbIndexQueue.add(KB_INDEX_JOB_NAME, {
      tenantId: tenantId.toString(),
      documentId: updated._id.toString(),
      version: updated.version,
    });
  }

  return mapKbDocumentToResponse(updated);
}

export async function deleteDocument(
  tenantId: TenantId,
  id: string,
): Promise<DeleteKbDocumentResponse> {
  const existing = await findByIdScoped(KbDocument, tenantId, id).lean().exec();
  if (!existing) throw new AppError('No se encontró el documento.', 404);

  await deleteManyScoped(KbChunk, tenantId, { documentId: id });
  await findOneAndDeleteScoped(KbDocument, tenantId, { _id: id });

  return { deleted: true };
}

/** Documentos base que arrancan la KB de cada tenant nuevo (solo título + propósito guía). */
const PRESET_DOCUMENTS: ReadonlyArray<{ titulo: string; proposito: string }> = [
  { titulo: 'Información de la empresa', proposito: 'Nombre, misión, visión' },
  { titulo: 'Productos y servicios', proposito: 'Catálogo de lo que ofrece' },
  { titulo: 'Horarios y ubicación', proposito: 'Datos de contacto' },
  { titulo: 'Políticas y términos', proposito: 'Reglas, garantías, devoluciones' },
  { titulo: 'Preguntas frecuentes', proposito: 'FAQ comunes' },
];

/**
 * Siembra los 5 documentos predefinidos de un tenant nuevo, con contenido vacío. NO llama a Gemini
 * ni encola jobs: la indexación ocurre cuando el admin edita cada preset y guarda (updateDocument).
 */
export async function seedPresetDocuments(tenantId: TenantId): Promise<void> {
  for (const preset of PRESET_DOCUMENTS) {
    await createScoped(KbDocument, tenantId, {
      titulo: preset.titulo,
      proposito: preset.proposito,
      contenido: '',
      isPreset: true,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });
  }
}
