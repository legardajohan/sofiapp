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
  IPlanTenantRef,
  IPlanUsage,
  IPlanInUseDetails,
} from './plan.types.js';

// `Plan` es catálogo GLOBAL: NO usa el repositorio *Scoped (no tiene `tenantId`).
// Excepción de superadmin, análoga al CRUD de `Tenant`.

// Un plan cuenta como "en uso" si CUALQUIER empresa lo tiene asignado (`Tenant.planId`), sin
// importar su `estado` (activo/suspendido/prueba). Criterio de INTEGRIDAD: borrar/editar un plan
// referenciado dejaría `tenants.planId` colgando (referencia huérfana). Ver `docs/specs/HU-SAAS-02-*`.

/** `true` si el error es un E11000 de Mongo (violación de índice único). */
function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export function mapPlanToResponse(
  doc: IPlanDocument,
  uso: IPlanUsage = { enUso: false, tenantCount: 0, tenants: [] },
): IPlanResponse {
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
    uso,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt.toISOString(),
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt.toISOString(),
  };
}

// ─── Uso del plan por empresas (reutilizable) ───────────────────────────────────

/** Empresas que tienen asignado el plan (cualquier estado). */
export async function getTenantsUsingPlan(
  planId: string | Types.ObjectId,
): Promise<IPlanTenantRef[]> {
  const docs = await Tenant.find({ planId }, { nombre: 1 }).lean<
    { _id: Types.ObjectId; nombre: string }[]
  >();
  return docs.map((t) => ({ id: t._id.toString(), name: t.nombre }));
}

/** `true` si al menos una empresa (cualquier estado) tiene asignado el plan. */
export async function isPlanInUse(planId: string | Types.ObjectId): Promise<boolean> {
  const count = await Tenant.countDocuments({ planId });
  return count > 0;
}

/**
 * Lanza `409 PLAN_IN_USE` (con la lista de empresas) si el plan está en uso. Debe invocarse
 * INMEDIATAMENTE antes de editar/eliminar para minimizar la ventana de concurrencia (CA req. 6).
 */
export async function assertPlanIsNotInUse(planId: string, planName?: string): Promise<void> {
  const tenants = await getTenantsUsingPlan(planId);
  if (tenants.length === 0) return;

  const nombre = planName ?? (await Plan.findById(planId).lean<IPlanDocument>())?.nombre ?? 'seleccionado';
  const listado = tenants.map((t) => t.name).join(', ');
  const details: IPlanInUseDetails = {
    planId,
    planName: nombre,
    tenantCount: tenants.length,
    tenants,
  };
  throw new AppError(
    `No se puede eliminar ni editar el plan ${nombre} porque está siendo utilizado por ${tenants.length} empresa(s): ${listado}.`,
    409,
    'PLAN_IN_USE',
    details,
  );
}

/** Uso agrupado por plan en UNA sola consulta (evita N+1 al listar). */
async function getUsageGroupedByPlan(): Promise<Map<string, IPlanTenantRef[]>> {
  const rows = await Tenant.aggregate<{
    _id: Types.ObjectId;
    tenants: { id: Types.ObjectId; name: string }[];
  }>([
    { $match: { planId: { $ne: null } } },
    { $group: { _id: '$planId', tenants: { $push: { id: '$_id', name: '$nombre' } } } },
  ]);

  const map = new Map<string, IPlanTenantRef[]>();
  for (const row of rows) {
    map.set(
      row._id.toString(),
      row.tenants.map((t) => ({ id: t.id.toString(), name: t.name })),
    );
  }
  return map;
}

export async function listPlans(filter: { activo?: boolean } = {}): Promise<IPlanResponse[]> {
  const query = filter.activo === undefined ? {} : { activo: filter.activo };
  const [docs, usageByPlan] = await Promise.all([
    Plan.find(query).sort({ precio: 1 }).lean<IPlanDocument[]>(),
    getUsageGroupedByPlan(),
  ]);
  return docs.map((doc) => {
    const tenants = usageByPlan.get(doc._id.toString()) ?? [];
    return mapPlanToResponse(doc, {
      enUso: tenants.length > 0,
      tenantCount: tenants.length,
      tenants,
    });
  });
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

  // Unicidad por (nombre + periodicidad): el mismo nombre se permite en otra periodicidad.
  const existing = await Plan.findOne({ nombre: dto.nombre, periodicidad: dto.periodicidad }).lean();
  if (existing) {
    throw new AppError(
      `Ya existe un plan "${dto.nombre}" con periodicidad ${dto.periodicidad}.`,
      409,
    );
  }

  // Fotografía de referencia (best-effort: null si aún no hay TRM; no bloquea la creación).
  const fotografiaFinanciera = await construirFotografiaFinanciera({
    administradores: dto.limites.administradores,
    precioUsd: dto.precio,
  });

  try {
    const plan = await Plan.create({
      ...dto,
      activo: dto.activo ?? true,
      numeroVersion: 1,
      ...(fotografiaFinanciera ? { fotografiaFinanciera } : {}),
    });
    return mapPlanToResponse(plan);
  } catch (err: unknown) {
    // Red de seguridad ante un índice único (incluye el legacy `nombre_1` aún presente): 409 claro.
    if (isDuplicateKeyError(err)) {
      throw new AppError(
        `Ya existe un plan "${dto.nombre}" con periodicidad ${dto.periodicidad}.`,
        409,
      );
    }
    throw err;
  }
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

  const tenants = await getTenantsUsingPlan(id);
  return mapPlanToResponse(updated, {
    enUso: tenants.length > 0,
    tenantCount: tenants.length,
    tenants,
  });
}

export async function updatePlan(id: string, dto: UpdatePlanDTO): Promise<IPlanResponse> {
  const existing = await Plan.findById(id).lean<IPlanDocument>();
  if (!existing) throw new AppError('Plan no encontrado.', 404);

  // Bloqueo por uso (409 PLAN_IN_USE): un plan en uso por empresas activas no se edita.
  await assertPlanIsNotInUse(id, existing.nombre);

  await assertAdministradoresWithinPlatformMax(dto.limites?.administradores);

  // La unicidad es por (nombre + periodicidad). Valores efectivos: lo que no viene en el DTO conserva
  // el valor actual del plan.
  const nombreEfectivo = dto.nombre ?? existing.nombre;
  const periodicidadEfectiva = dto.periodicidad ?? existing.periodicidad ?? PERIODICIDAD_PLAN_DEFAULT;

  // Revalidar solo si cambia nombre o periodicidad.
  if (dto.nombre !== undefined || dto.periodicidad !== undefined) {
    const dup = await Plan.findOne({
      nombre: nombreEfectivo,
      periodicidad: periodicidadEfectiva,
      _id: { $ne: id },
    }).lean();
    if (dup) {
      throw new AppError(
        `Ya existe un plan "${nombreEfectivo}" con periodicidad ${periodicidadEfectiva}.`,
        409,
      );
    }
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

  let plan: IPlanDocument | null;
  try {
    plan = await Plan.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true },
    ).lean<IPlanDocument>();
  } catch (err: unknown) {
    // Red de seguridad: si un índice único choca (p. ej. el índice legacy `nombre_1` aún presente),
    // devolvemos un 409 claro en lugar de un 500.
    if (isDuplicateKeyError(err)) {
      throw new AppError(
        `Ya existe un plan "${nombreEfectivo}" con periodicidad ${periodicidadEfectiva}.`,
        409,
      );
    }
    throw err;
  }

  if (!plan) throw new AppError('Plan no encontrado.', 404);
  return mapPlanToResponse(plan);
}

/**
 * Elimina un plan del catálogo. Bloquea (409 PLAN_IN_USE, con la lista de empresas) si alguna
 * empresa activa lo tiene asignado, para no dejar `tenants.planId` colgando; en ese caso el
 * superadmin debe reasignar esas empresas primero. La validación corre inmediatamente antes del
 * borrado (CA req. 6, concurrencia).
 */
export async function deletePlan(id: string): Promise<void> {
  const plan = await Plan.findById(id).lean<IPlanDocument>();
  if (!plan) throw new AppError('Plan no encontrado.', 404);

  await assertPlanIsNotInUse(id, plan.nombre);

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
