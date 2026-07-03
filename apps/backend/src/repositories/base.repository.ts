import type { Model, FilterQuery, UpdateQuery, Types, HydratedDocument } from 'mongoose';

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
