<<<<<<< HEAD
import type { Model, Document, FilterQuery, UpdateQuery, Types, DeleteResult } from 'mongoose';
=======
import type { Model, FilterQuery, UpdateQuery, Types, HydratedDocument } from 'mongoose';
>>>>>>> develop

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
<<<<<<< HEAD
  id: string | Types.ObjectId
=======
  id: string | Types.ObjectId,
>>>>>>> develop
) {
  return m.findOne({ _id: id, tenantId } as FilterQuery<T>);
}

<<<<<<< HEAD
export async function createScoped<T extends Document>(
  m: Model<T>,
  tenantId: TenantId,
  data: Record<string, unknown>
): Promise<T> {
  const doc = new m({ ...data, tenantId });
  return doc.save() as unknown as Promise<T>;
=======
export async function createScoped<T>(
  m: Model<T>,
  tenantId: TenantId,
  data: Record<string, unknown>,
): Promise<HydratedDocument<T>> {
  const doc = new m({ ...data, tenantId });
  return doc.save() as Promise<HydratedDocument<T>>;
>>>>>>> develop
}

export function findOneAndUpdateScoped<T>(
  m: Model<T>,
  tenantId: TenantId,
  filter: FilterQuery<T>,
  update: UpdateQuery<T>,
<<<<<<< HEAD
  options: Record<string, unknown> = {}
=======
  options: Record<string, unknown> = {},
>>>>>>> develop
) {
  return m.findOneAndUpdate({ ...filter, tenantId } as FilterQuery<T>, update, options);
}

export function findOneAndDeleteScoped<T>(
  m: Model<T>,
  tenantId: TenantId,
<<<<<<< HEAD
  filter: FilterQuery<T>
=======
  filter: FilterQuery<T>,
>>>>>>> develop
) {
  return m.findOneAndDelete({ ...filter, tenantId } as FilterQuery<T>);
}

export function deleteOneScoped<T>(
  m: Model<T>,
  tenantId: TenantId,
<<<<<<< HEAD
  filter: FilterQuery<T>
): Promise<DeleteResult> {
=======
  filter: FilterQuery<T>,
): ReturnType<Model<T>['deleteOne']> {
>>>>>>> develop
  return m.deleteOne({ ...filter, tenantId } as FilterQuery<T>);
}
