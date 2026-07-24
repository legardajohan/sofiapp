import { Types } from 'mongoose';
import { findByIdScoped, findScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { User } from './user.model.js';
import { toUserResponse, type IUserSource } from './user.mapper.js';
import type { IUserResponse } from './user.types.js';
import type { ListUsersQuery } from './user.validation.js';

type TenantId = string | Types.ObjectId;

export async function listTenantUsers(
  tenantId: TenantId,
  query: ListUsersQuery,
): Promise<IUserResponse[]> {
  const { activo, rol } = query;
  const docs = await findScoped(User, tenantId, { rol, activo })
    .sort({ nombre: 1 })
    .lean<IUserSource[]>();
  return docs.map(toUserResponse);
}

/**
 * Única guarda que impide asignar una conversación a un usuario ajeno: exige que sea `admin`
 * activo del propio tenant (el `tenantId` viene del token, nunca del body).
 */
export async function assertAssignableAdmin(
  tenantId: TenantId,
  userId: string,
): Promise<IUserResponse> {
  const doc = await findByIdScoped(User, tenantId, userId).lean<IUserSource>();
  if (!doc || doc.rol !== 'admin' || !doc.activo) {
    throw new AppError('Usuario no asignable.', 404);
  }
  return toUserResponse(doc);
}

/** Resuelve varios usuarios de una sola consulta (evita N+1 al proyectar listas). */
export async function findUsersByIds(
  tenantId: TenantId,
  ids: string[],
): Promise<Map<string, IUserResponse>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return new Map();

  const docs = await findScoped(User, tenantId, {
    _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) },
  }).lean<IUserSource[]>();

  const map = new Map<string, IUserResponse>();
  for (const doc of docs) map.set(String(doc._id), toUserResponse(doc));
  return map;
}
