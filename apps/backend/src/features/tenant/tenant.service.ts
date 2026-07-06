import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { Tenant } from './tenant.model.js';
import { UserModel } from '../users/user.model.js';
import { AppError } from '../../utils/AppError.js';
import type {
  CreateTenantDTO,
  UpdateTenantDTO,
  UpdateTenantStatusDTO,
  ITenantResponse,
  ITenantDocument,
  ListTenantsQuery,
  TenantsListResponse,
} from './tenant.types.js';

export function mapTenantToResponse(doc: ITenantDocument): ITenantResponse {
  return {
    _id: doc._id.toString(),
    nombre: doc.nombre,
    slug: doc.slug,
    nit: doc.nit,
    contacto: doc.contacto,
    estado: doc.estado,
    planId: doc.planId?.toString(),
    createdAt: (doc as unknown as { createdAt: Date }).createdAt.toISOString(),
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt.toISOString(),
  };
}

export async function listTenants(query: ListTenantsQuery): Promise<TenantsListResponse> {
  const { search, page, limit } = query;
  const filter = search
    ? { $or: [{ nombre: { $regex: search, $options: 'i' } }, { slug: { $regex: search, $options: 'i' } }] }
    : {};

  const [docs, total] = await Promise.all([
    Tenant.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<ITenantDocument[]>(),
    Tenant.countDocuments(filter),
  ]);

  return {
    data: docs.map(mapTenantToResponse),
    total,
    page,
    limit,
  };
}

export async function createTenant(dto: CreateTenantDTO): Promise<ITenantResponse> {
  const existing = await Tenant.findOne({ slug: dto.slug }).lean();
  if (existing) {
    throw new AppError('El slug ya está en uso.', 409);
  }

  let createdTenant: ITenantDocument | null = null;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const [tenant] = await Tenant.create(
        [
          {
            nombre: dto.nombre,
            slug: dto.slug,
            nit: dto.nit,
            contacto: dto.contacto,
            planId: dto.planId,
            estado: 'prueba',
          },
        ],
        { session }
      );

      if (!tenant) throw new AppError('Error al crear la empresa.', 500);

      if (dto.adminUser) {
        const passwordHash = await bcrypt.hash(dto.adminUser.password, 10);
        await UserModel.create(
          [
            {
              tenantId: tenant._id,
              nombre: dto.adminUser.nombre,
              email: dto.adminUser.email,
              passwordHash,
              rol: 'admin',
              activo: true,
            },
          ],
          { session }
        );
      }

      createdTenant = tenant;
    });
  } finally {
    await session.endSession();
  }

  if (!createdTenant) throw new AppError('Error al crear la empresa.', 500);
  return mapTenantToResponse(createdTenant);
}

export async function updateTenant(id: string, dto: UpdateTenantDTO): Promise<ITenantResponse> {
  const tenant = await Tenant.findByIdAndUpdate(
    id,
    { $set: dto },
    { new: true, runValidators: true }
  ).lean<ITenantDocument>();

  if (!tenant) throw new AppError('Empresa no encontrada.', 404);
  return mapTenantToResponse(tenant);
}

export async function updateTenantStatus(
  id: string,
  dto: UpdateTenantStatusDTO
): Promise<ITenantResponse> {
  const tenant = await Tenant.findById(id).lean<ITenantDocument>();
  if (!tenant) throw new AppError('Empresa no encontrada.', 404);

  if (tenant.estado === dto.estado) {
    throw new AppError('La empresa ya tiene ese estado.', 409);
  }

  const updated = await Tenant.findByIdAndUpdate(
    id,
    { $set: { estado: dto.estado } },
    { new: true }
  ).lean<ITenantDocument>();

  if (!updated) throw new AppError('Error al actualizar el estado.', 500);
  return mapTenantToResponse(updated);
}
