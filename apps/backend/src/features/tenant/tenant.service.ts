import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { Tenant } from './tenant.model.js';
import { UserModel } from '../users/user.model.js';
import { Plan } from '../plan/plan.model.js';
import { assertWithinQuota } from '../usage/usage.service.js';
import { construirFotografiaFinanciera } from '../../services/pricing/plan-costing.service.js';
import { seedSemaforoTags } from '../../seed/seed-semaforo-tags.js';
import { seedContactOptions } from '../../seed/seed-contact-options.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { seedPresetDocuments } from '../kb/kb.service.js';
import type { IPlanDocument } from '../plan/plan.types.js';
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
    fotografiaFinancieraContratada: doc.fotografiaFinancieraContratada,
    planContratadoVersion: doc.planContratadoVersion,
    fechaContratacion: doc.fechaContratacion
      ? new Date(doc.fechaContratacion).toISOString()
      : undefined,
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
        // Cuotas de puestos: el adminUser inicial (rol 'admin') ocupa un asiento y suma a 'usuarios'.
        // Ambos son no-op si la empresa aún no tiene plan asignado.
        // `session` es necesaria: el tenant recién creado aún no está confirmado fuera de esta
        // transacción, y sin ella la lectura de su plan no lo vería (quedaría como no-op siempre).
        await assertWithinQuota(tenant._id.toString(), 'usuarios', session);
        await assertWithinQuota(tenant._id.toString(), 'administradores', session);
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
  const tenant: ITenantDocument = createdTenant;

  // Siembra la KB con documentos base. Nunca debe tumbar la creación del tenant: el tenant ya
  // quedó creado; si el seeding falla, se registra y se sigue (se puede resembrar aparte).
  try {
    await seedPresetDocuments(tenant._id);
  } catch (err) {
    logger.error('seedPresetDocuments falló tras crear el tenant', {
      tenantId: tenant._id.toString(),
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Etiquetas de semaforización (HU-OMNI-04). Fuera de la transacción a propósito: no debe
  // impedir el alta de la empresa si falla, y `backfillSemaforoTags()` del arranque lo corrige.
  await seedSemaforoTags(tenant._id.toString());

  // Catálogos de interés / objeción / rol de la ficha del contacto (HU-CRM-02). Mismo criterio:
  // fuera de la transacción, y `backfillContactOptions()` del arranque lo corrige si falla.
  await seedContactOptions(tenant._id.toString());

  return mapTenantToResponse(tenant);
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

/** Asigna un plan (existente y activo) a una empresa. HU-SAAS-02. */
export async function assignPlanToTenant(id: string, planId: string): Promise<ITenantResponse> {
  const plan = await Plan.findById(planId).lean<IPlanDocument>();
  if (!plan || !plan.activo) throw new AppError('Plan no disponible.', 409);

  // Congela el precio contratado con la TRM vigente (no-retroactividad — CA-24).
  // best-effort: si aún no hay TRM, se asigna el plan sin fotografía (no bloquea la contratación).
  const fotografiaFinancieraContratada = await construirFotografiaFinanciera({
    administradores: plan.limites.administradores,
    precioUsd: plan.precio,
  });

  const set: Record<string, unknown> = {
    planId,
    planContratadoVersion: plan.numeroVersion ?? 1,
    fechaContratacion: new Date(),
  };
  if (fotografiaFinancieraContratada) {
    set['fotografiaFinancieraContratada'] = fotografiaFinancieraContratada;
  }

  const tenant = await Tenant.findByIdAndUpdate(id, { $set: set }, { new: true }).lean<ITenantDocument>();

  if (!tenant) throw new AppError('Empresa no encontrada.', 404);
  return mapTenantToResponse(tenant);
}

/**
 * Elimina una empresa y, en cascada, TODOS sus datos tenant-scoped (usuarios, uso, clientes,
 * etiquetas, conversaciones, mensajes, integraciones, logs de IA…). Operación de superadmin
 * cross-tenant (excepción documentada); el `tenantId` de la cascada es el de la empresa objetivo,
 * nunca del token de un usuario de tenant. Todo dentro de una transacción para no dejar huérfanos.
 */
export async function deleteTenant(id: string): Promise<void> {
  const tenant = await Tenant.findById(id);
  if (!tenant) throw new AppError('Empresa no encontrada.', 404);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Recorre los modelos registrados: los que tienen `tenantId` son tenant-scoped y se borran
      // filtrando por la empresa objetivo (a prueba de futuro: cubre modelos nuevos).
      for (const modelName of mongoose.modelNames()) {
        if (modelName === 'Tenant') continue;
        const Model = mongoose.model(modelName);
        if (Model.schema.path('tenantId')) {
          await Model.deleteMany({ tenantId: tenant._id }, { session });
        }
      }
      await Tenant.deleteOne({ _id: tenant._id }, { session });
    });
  } finally {
    await session.endSession();
  }
}
