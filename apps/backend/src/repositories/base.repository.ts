import { Types } from 'mongoose';
import type {
  Aggregate,
  FilterQuery,
  HydratedDocument,
  Model,
  PipelineStage,
  UpdateQuery,
} from 'mongoose';

type TenantId = string | Types.ObjectId;

export function findScoped<T>(m: Model<T>, tenantId: TenantId, filter: FilterQuery<T> = {}) {
  return m.find({ ...filter, tenantId } as FilterQuery<T>);
}

export function findOneScoped<T>(m: Model<T>, tenantId: TenantId, filter: FilterQuery<T> = {}) {
  return m.findOne({ ...filter, tenantId } as FilterQuery<T>);
}

export function findByIdScoped<T>(
  m: Model<T>,
  tenantId: TenantId,
  id: string | Types.ObjectId,
) {
  return m.findOne({ _id: id, tenantId } as FilterQuery<T>);
}

export async function createScoped<T>(
  m: Model<T>,
  tenantId: TenantId,
  data: Record<string, unknown>,
): Promise<HydratedDocument<T>> {
  const doc = new m({ ...data, tenantId });
  return doc.save() as Promise<HydratedDocument<T>>;
}

export function findOneAndUpdateScoped<T>(
  m: Model<T>,
  tenantId: TenantId,
  filter: FilterQuery<T>,
  update: UpdateQuery<T>,
  options: Record<string, unknown> = {},
) {
  return m.findOneAndUpdate({ ...filter, tenantId } as FilterQuery<T>, update, options);
}

export function updateManyScoped<T>(
  m: Model<T>,
  tenantId: TenantId,
  filter: FilterQuery<T>,
  update: UpdateQuery<T>,
): ReturnType<Model<T>['updateMany']> {
  return m.updateMany({ ...filter, tenantId } as FilterQuery<T>, update);
}

export function findOneAndDeleteScoped<T>(
  m: Model<T>,
  tenantId: TenantId,
  filter: FilterQuery<T>,
) {
  return m.findOneAndDelete({ ...filter, tenantId } as FilterQuery<T>);
}

export function deleteOneScoped<T>(
  m: Model<T>,
  tenantId: TenantId,
  filter: FilterQuery<T>,
): ReturnType<Model<T>['deleteOne']> {
  return m.deleteOne({ ...filter, tenantId } as FilterQuery<T>);
}

export function deleteManyScoped<T>(
  m: Model<T>,
  tenantId: TenantId,
  filter: FilterQuery<T> = {},
): ReturnType<Model<T>['deleteMany']> {
  return m.deleteMany({ ...filter, tenantId } as FilterQuery<T>);
}

export function countScoped<T>(
  m: Model<T>,
  tenantId: TenantId,
  filter: FilterQuery<T> = {},
): ReturnType<Model<T>['countDocuments']> {
  return m.countDocuments({ ...filter, tenantId } as FilterQuery<T>);
}

/**
 * Lo único que `aggregateScoped` necesita de un modelo.
 *
 * Se tipa así y no como `Model<T>` a propósito: `Model` es invariante en su parámetro de documento,
 * así que un helper genérico sobre él obliga a cada llamador a repetir el tipo del documento
 * —irrelevante aquí, porque el resultado de una agregación no tiene la forma del documento— o a
 * pelearse con la inferencia. Pidiendo solo `aggregate` el helper acepta cualquier modelo y el
 * llamador solo declara la forma de lo que espera recibir.
 */
interface Aggregable {
  aggregate<R>(pipeline: PipelineStage[]): Aggregate<R[]>;
}

/**
 * Agregación tenant-safe (HU-IA-07). El resto de este archivo cubre lecturas y escrituras de
 * documentos; esto es lo que faltaba para poder agrupar sin salirse del repositorio.
 *
 * **El `$match` del tenant va PRIMERO**, antes del pipeline que trae el llamador: así una etapa
 * `$match` propia solo puede reducir el conjunto, nunca ampliarlo. Al revés —el del tenant al
 * final— seguiría funcionando, pero cualquier `$group` o `$lookup` intermedio ya habría visto
 * documentos de otras empresas.
 *
 * **El `new Types.ObjectId(...)` no es cosmético.** `find`, `countDocuments` y compañía castean el
 * filtro contra el schema, así que un `tenantId` en forma de string funciona. Un pipeline de
 * agregación **no se castea**: ese mismo string no encontraría nada y devolvería `[]` sin lanzar.
 * Falla cerrado, pero en silencio, y es exactamente el detalle que este helper existe para que
 * ningún llamador tenga que recordar.
 */
export function aggregateScoped<R>(
  m: Aggregable,
  tenantId: TenantId,
  pipeline: PipelineStage[] = [],
): Aggregate<R[]> {
  const scoped =
    tenantId instanceof Types.ObjectId ? tenantId : new Types.ObjectId(tenantId);
  return m.aggregate<R>([{ $match: { tenantId: scoped } }, ...pipeline]);
}
