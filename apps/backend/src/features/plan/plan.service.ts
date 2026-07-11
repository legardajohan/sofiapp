import type { Types } from 'mongoose';
import { Plan } from './plan.model.js';
import { AppError } from '../../utils/AppError.js';
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
    limites: {
      usuarios: doc.limites.usuarios,
      mensajesMes: doc.limites.mensajesMes,
      leads: doc.limites.leads,
      campanasMes: doc.limites.campanasMes,
    },
    precio: doc.precio,
    costoEstimado: doc.costoEstimado,
    activo: doc.activo,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt.toISOString(),
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt.toISOString(),
  };
}

export async function listPlans(filter: { activo?: boolean } = {}): Promise<IPlanResponse[]> {
  const query = filter.activo === undefined ? {} : { activo: filter.activo };
  const docs = await Plan.find(query).sort({ precio: 1 }).lean<IPlanDocument[]>();
  return docs.map(mapPlanToResponse);
}

export async function createPlan(dto: CreatePlanDTO): Promise<IPlanResponse> {
  const existing = await Plan.findOne({ nombre: dto.nombre }).lean();
  if (existing) throw new AppError('Ya existe un plan con ese nombre.', 409);

  const plan = await Plan.create({ ...dto, activo: dto.activo ?? true });
  return mapPlanToResponse(plan);
}

export async function updatePlan(id: string, dto: UpdatePlanDTO): Promise<IPlanResponse> {
  if (dto.nombre !== undefined) {
    const dup = await Plan.findOne({ nombre: dto.nombre, _id: { $ne: id } }).lean();
    if (dup) throw new AppError('Ya existe un plan con ese nombre.', 409);
  }

  // `$set` con notación de punto para no pisar el subdocumento `limites` completo.
  const update: Record<string, unknown> = {};
  if (dto.nombre !== undefined) update['nombre'] = dto.nombre;
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

/** Límites del plan asignado a un tenant. `null` si no tiene plan o el plan está inactivo. */
export async function getPlanLimits(
  planId: string | Types.ObjectId | null | undefined,
): Promise<IPlanLimites | null> {
  if (!planId) return null;
  const plan = await Plan.findById(planId).lean<IPlanDocument>();
  if (!plan || !plan.activo) return null;
  return plan.limites;
}
