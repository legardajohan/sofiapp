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
import { Tenant } from '../tenant/tenant.model.js';
import type {
  CreateKbDocumentDTO,
  DeleteKbDocumentResponse,
  IKbDocument,
  IKbDocumentResponse,
  KbDocumentsListResponse,
} from './kb.types.js';

type TenantId = string | Types.ObjectId;

/**
 * Invalida la caché exacta de respuestas de IA del tenant: `AIService.chat()` incorpora
 * `kbVersion` a su clave de caché, así que un bump vuelve inalcanzables las entradas anteriores
 * (expiran solas por TTL). `Tenant` es la entidad raíz consultada por su propio `_id`, no por
 * `tenantId` — no aplica `*Scoped` (esa regla es para colecciones hijas de un tenant).
 */
async function bumpKbVersion(tenantId: TenantId): Promise<void> {
  await Tenant.updateOne({ _id: tenantId }, { $inc: { kbVersion: 1 } });
}

/**
 * Normaliza el contenido para decidir si un guardado cambia algo: recorta los extremos y colapsa
 * cualquier racha de whitespace a un solo espacio.
 *
 * Deliberadamente NO baja a minúsculas ni toca acentos ni puntuación: cambiar "Bogotá" por "bogotá"
 * ES un cambio de conocimiento. La comparación es conservadora a propósito — prefiere re-indexar de
 * más antes que dar por "sin cambios" una edición real y dejar a la IA entrenada con texto viejo.
 *
 * Tiene un espejo exacto en el frontend (`features/knowledge-base/lib/kb-presets.ts`), que lo usa
 * para anticipar la versión de destino en el modal. **Ambos cambian en lockstep.**
 */
export function normalizeContenido(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}

export function mapKbDocumentToResponse(doc: IKbDocument & { _id: Types.ObjectId }): IKbDocumentResponse {
  return {
    id: doc._id.toString(),
    titulo: doc.titulo,
    contenido: doc.contenido,
    estadoIndexacion: doc.estadoIndexacion,
    version: doc.version,
    chunkCount: doc.chunkCount,
    isPreset: doc.isPreset ?? false,
    obligatorio: doc.obligatorio ?? false,
    oculto: doc.oculto ?? false,
    ...(doc.proposito ? { proposito: doc.proposito } : {}),
    ...(doc.error ? { error: doc.error } : {}),
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

/**
 * Ingesta de texto: crea (o re-versiona) un KbDocument en estado `pendiente` y encola
 * el job `kb-index`. NO trocea ni genera embeddings inline (trabajo pesado → worker).
 *
 * Re-subir un título ya existente con el MISMO contenido (comparación normalizada) es un no-op:
 * ni re-versiona ni encola. Re-subir el título de un preset eliminado lo resucita (`oculto: false`)
 * sobre el mismo documento — el índice único { tenantId, titulo } impide cualquier duplicado.
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
    // Guardado sin cambios reales: no re-versiona, no borra chunks, no encola y no toca `updatedAt`.
    if (normalizeContenido(dto.contenido) === normalizeContenido(existing.contenido ?? '')) {
      return mapKbDocumentToResponse(existing);
    }

    // Re-subida del mismo título → nueva versión + re-indexado.
    const updated = await findOneAndUpdateScoped(
      KbDocument,
      tenantId,
      { _id: existing._id },
      {
        $set: {
          contenido: dto.contenido,
          estadoIndexacion: 'pendiente',
          chunkCount: 0,
          // Re-alta: si el documento estaba oculto por un borrado previo, vuelve al panel.
          oculto: false,
        },
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
 *
 * El primer llenado (contenido previo vacío → texto real, típico de un preset seedeado en `version: 1`)
 * NO incrementa la versión: el documento queda en `version: 1`. Las ediciones posteriores sobre
 * contenido ya real sí incrementan `version` normalmente.
 *
 * Si el contenido entrante es equivalente al guardado (comparación normalizada de whitespace) el
 * guardado es un NO-OP TOTAL: sin versión nueva, sin borrar chunks, sin re-indexar, sin invalidar la
 * caché de IA y sin tocar `updatedAt`. Abrir el modal y guardar sin escribir no cuesta nada.
 */
export async function updateDocument(
  tenantId: TenantId,
  id: string,
  contenido: string,
): Promise<IKbDocumentResponse> {
  const existing = await findByIdScoped(KbDocument, tenantId, id)
    .lean<(IKbDocument & { _id: Types.ObjectId }) | null>()
    .exec();
  if (!existing) throw new AppError('No se encontró el documento.', 404);

  // Nada cambió: se devuelve el documento tal cual, sin ejecutar una sola escritura. Al no llegar a
  // `findOneAndUpdateScoped`, Mongoose tampoco estampa `updatedAt` — la fecha se queda donde estaba.
  if (normalizeContenido(contenido) === normalizeContenido(existing.contenido ?? '')) {
    return mapKbDocumentToResponse(existing);
  }

  // Primer llenado de un preset (o de cualquier documento vacío): pasa de contenido '' a texto real.
  // No es una "nueva versión" del conocimiento, sino la versión 1 → no se incrementa `version`.
  const isFirstFill = !existing.contenido || existing.contenido.trim().length === 0;

  const updated = await findOneAndUpdateScoped(
    KbDocument,
    tenantId,
    { _id: id },
    {
      $set: { contenido, estadoIndexacion: 'pendiente' as const, chunkCount: 0 },
      ...(isFirstFill ? {} : { $inc: { version: 1 } }),
      $unset: { error: 1 },
    },
    { new: true },
  )
    .lean<(IKbDocument & { _id: Types.ObjectId }) | null>()
    .exec();
  if (!updated) throw new AppError('No se pudo actualizar el documento.', 500);

  // Los embeddings anteriores ya no corresponden al nuevo texto.
  await deleteManyScoped(KbChunk, tenantId, { documentId: id });

  // Invalida la caché de IA solo si el cambio afecta contenido real (edición, vaciado de un
  // documento con texto, o primer llenado de un preset). Vacío→vacío no mueve el contador.
  const hadContent = existing.contenido.trim().length > 0;
  const hasContentNow = contenido.trim().length > 0;
  if (hadContent || hasContentNow) {
    await bumpKbVersion(tenantId);
  }

  if (contenido.trim().length > 0) {
    await kbIndexQueue.add(KB_INDEX_JOB_NAME, {
      tenantId: tenantId.toString(),
      documentId: updated._id.toString(),
      version: updated.version,
    });
  }

  return mapKbDocumentToResponse(updated);
}

/**
 * Elimina un documento. Dos políticas según qué sea (ver `esPreset` más abajo):
 *  - **Categoría predefinida** → *soft-delete*: se borran sus chunks y se marca `oculto: true`, pero
 *    el documento sobrevive. Sin esto el frontend la repondría como tarjeta virtual "Sin llenar" en
 *    el siguiente render, y eliminarla sería un no-op visual.
 *  - **Documento libre** → borrado duro, como siempre.
 *
 * Un documento `obligatorio` no se puede eliminar por ninguna de las dos vías: es el mínimo que la
 * IA necesita para responder. La regla se valida aquí, no solo escondiendo el botón en la UI.
 */
export async function deleteDocument(
  tenantId: TenantId,
  id: string,
): Promise<DeleteKbDocumentResponse> {
  const existing = await findByIdScoped(KbDocument, tenantId, id)
    .lean<(IKbDocument & { _id: Types.ObjectId }) | null>()
    .exec();
  // El 404 va primero: un tenant que apunte al id de otro no debe distinguir "no existe" de
  // "existe pero es obligatorio". El aislamiento se resuelve antes que la regla de negocio.
  if (!existing) throw new AppError('No se encontró el documento.', 404);
  if (existing.obligatorio === true) {
    throw new AppError('No puedes eliminar un conocimiento obligatorio.', 400);
  }

  await deleteManyScoped(KbChunk, tenantId, { documentId: id });

  if (esPreset(existing)) {
    await findOneAndUpdateScoped(KbDocument, tenantId, { _id: id }, {
      // `contenido: ''` es deliberado: sus chunks acaban de irse, así que ese texto ya no alimenta a
      // la IA. Si el admin la resucita re-subiendo el título, la recupera vacía.
      $set: { oculto: true, contenido: '', estadoIndexacion: 'pendiente' as const, chunkCount: 0 },
      $unset: { error: 1 },
    }).exec();
  } else {
    await findOneAndDeleteScoped(KbDocument, tenantId, { _id: id });
  }

  await bumpKbVersion(tenantId);

  return { deleted: true };
}

/**
 * Documentos base que arrancan la KB de cada tenant nuevo (solo título + propósito guía).
 * `obligatorio: true` marca el mínimo que la IA necesita para responder con precisión; es guía
 * visual en el frontend, no impone restricciones en el backend.
 */
const PRESET_DOCUMENTS: ReadonlyArray<{ titulo: string; proposito: string; obligatorio: boolean }> = [
  { titulo: 'Información de la empresa', proposito: 'Nombre, misión, visión', obligatorio: true },
  { titulo: 'Productos y servicios', proposito: 'Catálogo de lo que ofrece', obligatorio: true },
  { titulo: 'Horarios y ubicación', proposito: 'Datos de contacto', obligatorio: false },
  { titulo: 'Políticas y términos', proposito: 'Reglas, garantías, devoluciones', obligatorio: false },
  { titulo: 'Información Complementaria', proposito: 'Datos adicionales de referencia para la IA', obligatorio: false },
];

const PRESET_TITULOS: ReadonlySet<string> = new Set(PRESET_DOCUMENTS.map((p) => p.titulo));

/**
 * `true` si el documento ocupa una de las 5 categorías predefinidas.
 *
 * Se decide **por título** además de por el flag: un preset re-creado vía POST nace
 * `isPreset: false` —el borde HTTP solo acepta `titulo` y `contenido`, y el schema aplica el
 * default—, y el frontend le re-impone la identidad por título en `mergePresetsWithDocuments`.
 * Como el merge repone la tarjeta por título, el borrado tiene que usar el mismo criterio: mirando
 * solo `isPreset`, borrar un preset recreado lo haría reaparecer igual que antes de HU-KB-06.
 */
function esPreset(doc: IKbDocument): boolean {
  return doc.isPreset === true || PRESET_TITULOS.has(doc.titulo);
}

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
      obligatorio: preset.obligatorio,
      oculto: false,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });
  }
}
