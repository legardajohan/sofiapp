import type { Types } from 'mongoose';
import { Plan } from './plan.model.js';
import { PERIODICIDAD_PLAN_DEFAULT } from './plan.constants.js';
import { AppError } from '../../utils/AppError.js';
import { getSettings } from '../platform-settings/platform-settings.service.js';
import { construirFotografiaFinanciera } from '../../services/pricing/plan-costing.service.js';
import { Tenant } from '../tenant/tenant.model.js';
import type {
  CreatePlanDTO,
  UpdatePlanDTO,
  IPlanResponse,
  IPlanDocument,
  IPlanLimites,
} from './plan.types.js';

// `Plan` es catálogo GLOBAL: NO usa el repositorio *Scoped (no tiene `tenantId`).
// Excepción de superadmin, análoga al CRUD de `Tenant`.

export function mapPlanToResponse(doc: IPlanDocument): IPlanResponse {
  return {
    _id: doc._id.toString(),
    nombre: doc.nombre,
    descripcion: doc.descripcion,
    periodicidad: doc.periodicidad ?? PERIODICIDAD_PLAN_DEFAULT,
    limites: {
      usuarios: doc.limites.usuarios,
      administradores: doc.limites.administradores,
      mensajesMes: doc.limites.mensajesMes,
      leads: doc.limites.leads,
      campanasMes: doc.limites.campanasMes,
    },
    perfilesPermitidos: doc.perfilesPermitidos ?? [],
    precio: doc.precio,
    costoEstimado: doc.costoEstimado,
    activo: doc.activo,
    numeroVersion: doc.numeroVersion ?? 1,
    fotografiaFinanciera: doc.fotografiaFinanciera,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt.toISOString(),
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt.toISOString(),
  };
}

export async function listPlans(filter: { activo?: boolean } = {}): Promise<IPlanResponse[]> {
  const query = filter.activo === undefined ? {} : { activo: filter.activo };
  const docs = await Plan.find(query).sort({ precio: 1 }).lean<IPlanDocument[]>();
  return docs.map(mapPlanToResponse);
}

/**
 * Aplica el máximo técnico GLOBAL de administradores por plan. Es el ÚNICO punto donde vive el
 * tope: `PlatformSettings.maxAdministradoresPorPlan` (configurable por el superadmin, no hardcodeado).
 */
async function assertAdministradoresWithinPlatformMax(
  administradores: number | undefined,
): Promise<void> {
  if (administradores === undefined) return;
  const { maxAdministradoresPorPlan } = await getSettings();
  if (administradores > maxAdministradoresPorPlan) {
    throw new AppError(
      `La cantidad de administradores (${administradores}) supera el máximo técnico por plan (${maxAdministradoresPorPlan}).`,
      422,
    );
  }
}

export async function createPlan(dto: CreatePlanDTO): Promise<IPlanResponse> {
  await assertAdministradoresWithinPlatformMax(dto.limites.administradores);

  const existing = await Plan.findOne({ nombre: dto.nombre }).lean();
  if (existing) throw new AppError('Ya existe un plan con ese nombre.', 409);

  // Fotografía de referencia (best-effort: null si aún no hay TRM; no bloquea la creación).
  const fotografiaFinanciera = await construirFotografiaFinanciera({
    administradores: dto.limites.administradores,
    precioUsd: dto.precio,
  });

  const plan = await Plan.create({
    ...dto,
    activo: dto.activo ?? true,
    numeroVersion: 1,
    ...(fotografiaFinanciera ? { fotografiaFinanciera } : {}),
  });
  return mapPlanToResponse(plan);
}

/**
 * Genera una NUEVA VERSIÓN del plan (acción explícita del superadmin): incrementa `numeroVersion`
 * y recalcula la fotografía con la TRM vigente en ese momento. Los tenants ya contratados NO se
 * ven afectados (su precio vive congelado en el propio tenant — CA-24).
 */
export async function nuevaVersionPlan(id: string): Promise<IPlanResponse> {
  const plan = await Plan.findById(id).lean<IPlanDocument>();
  if (!plan) throw new AppError('Plan no encontrado.', 404);

  const fotografiaFinanciera = await construirFotografiaFinanciera({
    administradores: plan.limites.administradores,
    precioUsd: plan.precio,
  });

  const update: Record<string, unknown> = { $inc: { numeroVersion: 1 } };
  if (fotografiaFinanciera) update['$set'] = { fotografiaFinanciera };

  const updated = await Plan.findByIdAndUpdate(id, update, { new: true }).lean<IPlanDocument>();
  if (!updated) throw new AppError('Plan no encontrado.', 404);
  return mapPlanToResponse(updated);
}

export async function updatePlan(id: string, dto: UpdatePlanDTO): Promise<IPlanResponse> {
  await assertAdministradoresWithinPlatformMax(dto.limites?.administradores);

  if (dto.nombre !== undefined) {
    const dup = await Plan.findOne({ nombre: dto.nombre, _id: { $ne: id } }).lean();
    if (dup) throw new AppError('Ya existe un plan con ese nombre.', 409);
  }

  // `$set` con notación de punto para no pisar el subdocumento `limites` completo.
  const update: Record<string, unknown> = {};
  if (dto.nombre !== undefined) update['nombre'] = dto.nombre;
  if (dto.descripcion !== undefined) update['descripcion'] = dto.descripcion;
  if (dto.periodicidad !== undefined) update['periodicidad'] = dto.periodicidad;
  if (dto.perfilesPermitidos !== undefined) update['perfilesPermitidos'] = dto.perfilesPermitidos;
  if (dto.precio !== undefined) update['precio'] = dto.precio;
  if (dto.costoEstimado !== undefined) update['costoEstimado'] = dto.costoEstimado;
  if (dto.activo !== undefined) update['activo'] = dto.activo;
  if (dto.limites) {
    for (const [key, value] of Object.entries(dto.limites)) {
      if (value !== undefined) update[`limites.${key}`] = value;
    }
  }

  const plan = await Plan.findByIdAndUpdate(
    id,
    { $set: update },
    { new: true, runValidators: true },
  ).lean<IPlanDocument>();

  if (!plan) throw new AppError('Plan no encontrado.', 404);
  return mapPlanToResponse(plan);
}

/**
 * Elimina un plan del catálogo. Bloquea (409) si alguna empresa lo tiene asignado, para no dejar
 * `tenants.planId` colgando; en ese caso el superadmin debe reasignar esas empresas primero.
 */
export async function deletePlan(id: string): Promise<void> {
  const plan = await Plan.findById(id).lean<IPlanDocument>();
  if (!plan) throw new AppError('Plan no encontrado.', 404);

  const enUso = await Tenant.countDocuments({ planId: id });
  if (enUso > 0) {
    throw new AppError(
      `No se puede eliminar: ${enUso} empresa(s) tienen este plan asignado. Reasígnalas primero.`,
      409,
    );
  }

  await Plan.findByIdAndDelete(id);
}

/** Límites del plan asignado a un tenant. `null` si no tiene plan o el plan está inactivo. */
export async function getPlanLimits(
  planId: string | Types.ObjectId | null | undefined,
): Promise<IPlanLimites | null> {
  if (!planId) return null;
  const plan = await Plan.findById(planId).lean<IPlanDocument>();
  if (!plan || !plan.activo) return null;
  return plan.limites;
}
