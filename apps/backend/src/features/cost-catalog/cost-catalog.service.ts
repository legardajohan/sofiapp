import { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { CostItem } from './cost-catalog.model.js';
import type {
  CreateCostItemDTO,
  UpdateCostItemDTO,
  ICostItemDocument,
  ICostItemResponse,
} from './cost-catalog.types.js';

// `CostItem` es catálogo GLOBAL: NO usa el repositorio *Scoped (no tiene `tenantId`).

function toDecimalOrUndef(v?: string): Types.Decimal128 | undefined {
  return v === undefined ? undefined : Types.Decimal128.fromString(v);
}

function mapToResponse(doc: ICostItemDocument): ICostItemResponse {
  return {
    _id: doc._id.toString(),
    concepto: doc.concepto,
    currency: doc.currency,
    unitCostOriginal: doc.unitCostOriginal ? doc.unitCostOriginal.toString() : undefined,
    fixedCostOriginal: doc.fixedCostOriginal ? doc.fixedCostOriginal.toString() : undefined,
    unit: doc.unit,
    effectiveFrom: doc.effectiveFrom.toISOString(),
    active: doc.active,
    fuente: doc.fuente,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt.toISOString(),
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt.toISOString(),
  };
}

export async function listCostItems(
  filter: { active?: boolean } = {},
): Promise<ICostItemResponse[]> {
  const query = filter.active === undefined ? {} : { active: filter.active };
  const docs = await CostItem.find(query).sort({ concepto: 1 }).lean<ICostItemDocument[]>();
  return docs.map(mapToResponse);
}

export async function createCostItem(dto: CreateCostItemDTO): Promise<ICostItemResponse> {
  const doc = await CostItem.create({
    concepto: dto.concepto,
    currency: dto.currency,
    unitCostOriginal: toDecimalOrUndef(dto.unitCostOriginal),
    fixedCostOriginal: toDecimalOrUndef(dto.fixedCostOriginal),
    unit: dto.unit,
    effectiveFrom: dto.effectiveFrom ?? new Date(),
    active: dto.active ?? true,
    fuente: dto.fuente,
  });
  return mapToResponse(doc);
}

export async function updateCostItem(
  id: string,
  dto: UpdateCostItemDTO,
): Promise<ICostItemResponse> {
  const update: Record<string, unknown> = {};
  if (dto.concepto !== undefined) update['concepto'] = dto.concepto;
  if (dto.currency !== undefined) update['currency'] = dto.currency;
  if (dto.unitCostOriginal !== undefined)
    update['unitCostOriginal'] = Types.Decimal128.fromString(dto.unitCostOriginal);
  if (dto.fixedCostOriginal !== undefined)
    update['fixedCostOriginal'] = Types.Decimal128.fromString(dto.fixedCostOriginal);
  if (dto.unit !== undefined) update['unit'] = dto.unit;
  if (dto.effectiveFrom !== undefined) update['effectiveFrom'] = dto.effectiveFrom;
  if (dto.active !== undefined) update['active'] = dto.active;
  if (dto.fuente !== undefined) update['fuente'] = dto.fuente;

  const doc = await CostItem.findByIdAndUpdate(id, { $set: update }, {
    new: true,
    runValidators: true,
  }).lean<ICostItemDocument>();
  if (!doc) throw new AppError('Concepto de costo no encontrado.', 404);
  return mapToResponse(doc);
}

export async function deleteCostItem(id: string): Promise<void> {
  const doc = await CostItem.findByIdAndDelete(id).lean();
  if (!doc) throw new AppError('Concepto de costo no encontrado.', 404);
}
