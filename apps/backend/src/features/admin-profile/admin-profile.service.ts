import type { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import {
  findScoped,
  findOneScoped,
  createScoped,
  findOneAndUpdateScoped,
  findOneAndDeleteScoped,
} from '../../repositories/base.repository.js';
import { AdminProfile } from './admin-profile.model.js';
import { PERFILES_BASE_CATALOGO, type IPerfilBase } from './admin-profile.constants.js';
import type {
  CreateAdminProfileDTO,
  UpdateAdminProfileDTO,
  IAdminProfileResponse,
  IAdminProfileDocument,
} from './admin-profile.types.js';

type TenantId = string | Types.ObjectId;

/** Catálogo BASE global (no depende de tenant): el mismo para todo el mundo. */
export function getBaseProfiles(): readonly IPerfilBase[] {
  return PERFILES_BASE_CATALOGO;
}

function mapToResponse(doc: IAdminProfileDocument): IAdminProfileResponse {
  return {
    _id: doc._id.toString(),
    nombre: doc.nombre,
    activo: doc.activo,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt.toISOString(),
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt.toISOString(),
  };
}

export async function listAdminProfiles(tenantId: TenantId): Promise<IAdminProfileResponse[]> {
  const docs = await findScoped(AdminProfile, tenantId, {})
    .sort({ nombre: 1 })
    .lean<IAdminProfileDocument[]>();
  return docs.map(mapToResponse);
}

export async function createAdminProfile(
  tenantId: TenantId,
  dto: CreateAdminProfileDTO,
): Promise<IAdminProfileResponse> {
  const existing = await findOneScoped(AdminProfile, tenantId, { nombre: dto.nombre }).lean();
  if (existing) throw new AppError('Ya existe una etiqueta con ese nombre.', 409);

  const doc = await createScoped(AdminProfile, tenantId, { nombre: dto.nombre, activo: true });
  return mapToResponse(doc as unknown as IAdminProfileDocument);
}

export async function updateAdminProfile(
  tenantId: TenantId,
  id: string,
  dto: UpdateAdminProfileDTO,
): Promise<IAdminProfileResponse> {
  const doc = await findOneAndUpdateScoped(
    AdminProfile,
    tenantId,
    { _id: id },
    { $set: dto },
    { new: true, runValidators: true },
  ).lean<IAdminProfileDocument>();

  if (!doc) throw new AppError('Etiqueta no encontrada.', 404);
  return mapToResponse(doc);
}

export async function deleteAdminProfile(tenantId: TenantId, id: string): Promise<void> {
  const doc = await findOneAndDeleteScoped(AdminProfile, tenantId, { _id: id }).lean();
  if (!doc) throw new AppError('Etiqueta no encontrada.', 404);
}
