import { Types } from 'mongoose';
import {
  createScoped,
  findByIdScoped,
  findOneAndDeleteScoped,
  findOneAndUpdateScoped,
  findScoped,
  updateManyScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Tag } from './tag.model.js';
import type { CreateTagDTO, ITag, ITagResponse, UpdateTagDTO } from './tag.types.js';

type TenantId = string | Types.ObjectId;

/** Forma lean de un `Tag` con el `_id` que Mongoose no incluye en `ITag`. */
interface ITagLean extends ITag {
  _id: Types.ObjectId;
}

function toTagResponse(doc: ITagLean): ITagResponse {
  return {
    id: String(doc._id),
    nombre: doc.nombre,
    color: doc.color,
    semaforo: doc.semaforo ?? null,
  };
}

/** El índice único `{ tenantId, nombre }` es la única defensa real contra la carrera de dos
 *  creaciones simultáneas. Traducimos su error de Mongo a un `AppError` accionable en vez de
 *  dejar que escape como 500. */
function esNombreDuplicado(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

const NOMBRE_DUPLICADO = 'Ya existe una etiqueta con ese nombre. Elige otro.';

export async function listTags(tenantId: TenantId): Promise<ITagResponse[]> {
  const docs = await findScoped(Tag, tenantId, {})
    .sort({ nombre: 1 })
    .collation({ locale: 'es', strength: 2 })
    .lean<ITagLean[]>();
  return docs.map(toTagResponse);
}

/** Resuelve varias etiquetas de una sola consulta (evita N+1 al proyectar la bandeja). */
export async function findTagsByIds(
  tenantId: TenantId,
  ids: string[],
): Promise<Map<string, ITagResponse>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return new Map();

  const docs = await findScoped(Tag, tenantId, {
    _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) },
  }).lean<ITagLean[]>();

  const map = new Map<string, ITagResponse>();
  for (const doc of docs) map.set(String(doc._id), toTagResponse(doc));
  return map;
}

export async function createTag(tenantId: TenantId, dto: CreateTagDTO): Promise<ITagResponse> {
  try {
    const doc = await createScoped(Tag, tenantId, { ...dto });
    return toTagResponse(doc.toObject() as ITagLean);
  } catch (err) {
    if (esNombreDuplicado(err)) throw new AppError(NOMBRE_DUPLICADO, 409);
    throw err;
  }
}

export async function updateTag(
  tenantId: TenantId,
  tagId: string,
  dto: UpdateTagDTO,
): Promise<ITagResponse> {
  // `semaforo` no está en `UpdateTagDTO`, así que renombrar o recolorear una etiqueta de sistema
  // conserva su identidad: es justo lo que permite que otros módulos sigan encontrándola.
  try {
    const doc = await findOneAndUpdateScoped(
      Tag,
      tenantId,
      { _id: new Types.ObjectId(tagId) },
      dto,
      { new: true, runValidators: true },
    ).lean<ITagLean>();
    if (!doc) throw new AppError('Etiqueta no encontrada.', 404);
    return toTagResponse(doc);
  } catch (err) {
    if (esNombreDuplicado(err)) throw new AppError(NOMBRE_DUPLICADO, 409);
    throw err;
  }
}

/**
 * Borra la etiqueta y la retira de todas las conversaciones del tenant. Sin el `$pull` quedarían
 * `tagIds` apuntando a un documento inexistente, y la hidratación de la bandeja los descartaría en
 * silencio — un chip que desaparece sin que nadie sepa por qué.
 */
export async function deleteTag(tenantId: TenantId, tagId: string): Promise<void> {
  const tag = await findByIdScoped(Tag, tenantId, tagId).lean<ITagLean>();
  if (!tag) throw new AppError('Etiqueta no encontrada.', 404);
  if (tag.semaforo) {
    throw new AppError(
      'Las etiquetas de semaforización no se pueden eliminar. Puedes renombrarlas o cambiarles el color.',
      409,
    );
  }

  const oid = new Types.ObjectId(tagId);
  await findOneAndDeleteScoped(Tag, tenantId, { _id: oid });
  await updateManyScoped(Cliente, tenantId, { tagIds: oid }, { $pull: { tagIds: oid } });
}

/**
 * Verifica que TODOS los ids pertenezcan al tenant. Se usa antes de escribir `Cliente.tagIds`:
 * es el único punto por donde un id de otro tenant podría entrar (viene del body).
 */
export async function assertTagsDelTenant(tenantId: TenantId, tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) return;
  const encontrados = await findTagsByIds(tenantId, tagIds);
  if (encontrados.size !== new Set(tagIds).size) {
    throw new AppError('Alguna de las etiquetas no existe en esta empresa.', 422);
  }
}
