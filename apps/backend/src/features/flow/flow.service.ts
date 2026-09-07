import { Types } from 'mongoose';
import {
  createScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findOneScoped,
  findScoped,
  updateManyScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { Flow } from './flow.model.js';
import type {
  CreateFlowDTO,
  IFlowLean,
  IFlowListItemResponse,
  IFlowResponse,
  UpdateFlowDTO,
} from './flow.types.js';

type TenantId = string | Types.ObjectId;

function toFlowResponse(doc: IFlowLean): IFlowResponse {
  return {
    id: String(doc._id),
    nombre: doc.nombre,
    nodos: doc.nodos,
    aristas: doc.aristas,
    entrada: doc.entrada,
    version: doc.version,
    estado: doc.estado,
    activo: doc.activo,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toFlowListItemResponse(doc: IFlowLean): IFlowListItemResponse {
  return {
    id: String(doc._id),
    nombre: doc.nombre,
    version: doc.version,
    estado: doc.estado,
    activo: doc.activo,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** El índice parcial único `{ tenantId }` (`activo: true`) es la única defensa real contra dos
 *  activaciones concurrentes; este error de Mongo es su reflejo cuando la desactivación previa
 *  no alcanzó a aplicarse a tiempo. */
function esActivacionConcurrente(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export async function listFlows(tenantId: TenantId): Promise<IFlowListItemResponse[]> {
  const docs = await findScoped(Flow, tenantId, {})
    .sort({ updatedAt: -1 })
    .lean<IFlowLean[]>();
  return docs.map(toFlowListItemResponse);
}

export async function getFlowById(tenantId: TenantId, flowId: string): Promise<IFlowResponse> {
  const doc = await findByIdScoped(Flow, tenantId, flowId).lean<IFlowLean>();
  if (!doc) throw new AppError('Flujo no encontrado.', 404);
  return toFlowResponse(doc);
}

/** Trae el flujo `activo` del tenant, con `_id`, para el runtime. `null` si el tenant no tiene
 *  ninguno activo — el motor de flujos simplemente no interviene. */
export async function getActiveFlow(tenantId: TenantId): Promise<IFlowLean | null> {
  return findOneScoped(Flow, tenantId, { activo: true }).lean<IFlowLean | null>();
}

/** Desactiva el flujo `activo` anterior del tenant, si lo hay. Se llama SIEMPRE antes de crear o
 *  guardar un flujo con `activo: true`, en la misma operación lógica: el índice parcial único es
 *  la garantía dura, esto es lo que evita que la petición choque contra ella en el camino feliz. */
async function desactivarFlowActivo(tenantId: TenantId, exceptoId?: string): Promise<void> {
  const filtro: Record<string, unknown> = { activo: true };
  if (exceptoId) filtro['_id'] = { $ne: new Types.ObjectId(exceptoId) };
  await updateManyScoped(Flow, tenantId, filtro, { $set: { activo: false } });
}

export async function createFlow(tenantId: TenantId, dto: CreateFlowDTO): Promise<IFlowResponse> {
  if (dto.activo) await desactivarFlowActivo(tenantId);

  try {
    const doc = await createScoped(Flow, tenantId, {
      nombre: dto.nombre,
      nodos: dto.nodos,
      aristas: dto.aristas,
      entrada: dto.entrada,
      version: 1,
      estado: 'borrador',
      activo: dto.activo ?? false,
    });
    return toFlowResponse(doc.toObject() as unknown as IFlowLean);
  } catch (err) {
    if (esActivacionConcurrente(err)) {
      throw new AppError('Ya hay otro flujo activándose para esta empresa. Intenta de nuevo.', 409);
    }
    throw err;
  }
}

export async function updateFlow(
  tenantId: TenantId,
  flowId: string,
  dto: UpdateFlowDTO,
): Promise<IFlowResponse> {
  const actual = await findByIdScoped(Flow, tenantId, flowId).lean<IFlowLean>();
  if (!actual) throw new AppError('Flujo no encontrado.', 404);

  if (dto.activo) await desactivarFlowActivo(tenantId, flowId);

  try {
    const actualizado = await findOneAndUpdateScoped(
      Flow,
      tenantId,
      { _id: new Types.ObjectId(flowId) },
      {
        $set: {
          ...(dto.nombre !== undefined && { nombre: dto.nombre }),
          ...(dto.nodos !== undefined && { nodos: dto.nodos }),
          ...(dto.aristas !== undefined && { aristas: dto.aristas }),
          ...(dto.entrada !== undefined && { entrada: dto.entrada }),
          ...(dto.estado !== undefined && { estado: dto.estado }),
          ...(dto.activo !== undefined && { activo: dto.activo }),
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true },
    ).lean<IFlowLean>();
    if (!actualizado) throw new AppError('Flujo no encontrado.', 404);
    return toFlowResponse(actualizado);
  } catch (err) {
    if (esActivacionConcurrente(err)) {
      throw new AppError('Ya hay otro flujo activándose para esta empresa. Intenta de nuevo.', 409);
    }
    throw err;
  }
}
