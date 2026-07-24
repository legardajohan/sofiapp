import type { Query, Types } from 'mongoose';
import { createScoped, countScoped, findScoped } from '../../repositories/base.repository.js';
import { logger } from '../../utils/logger.js';
import { AuditEvent } from './audit.model.js';
import type {
  AuditEntidad,
  IAuditEventDocument,
  IAuditEventResponse,
  RecordAuditInput,
} from './audit.types.js';

type TenantId = string | Types.ObjectId;

function toAuditEventResponse(doc: IAuditEventDocument): IAuditEventResponse {
  return {
    id: doc._id.toString(),
    actorId: doc.actorId.toString(),
    accion: doc.accion,
    entidad: doc.entidad,
    entidadId: doc.entidadId.toString(),
    antes: doc.antes,
    despues: doc.despues,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt.toISOString(),
  };
}

/**
 * Registra un evento de auditoría. Nunca lanza: la operación de negocio que la origina ya se
 * persistió, así que un fallo aquí solo se loguea (perder la bitácora no debe romper al usuario).
 */
export async function recordAuditEvent(tenantId: TenantId, input: RecordAuditInput): Promise<void> {
  try {
    await createScoped(AuditEvent, tenantId, {
      actorId: input.actorId,
      accion: input.accion,
      entidad: input.entidad,
      entidadId: input.entidadId,
      antes: input.antes,
      despues: input.despues,
    });
  } catch (err) {
    logger.error('No se pudo registrar el evento de auditoría', {
      error: String(err),
      accion: input.accion,
      entidadId: input.entidadId,
    });
  }
}

export function listAuditEventsQuery(
  tenantId: TenantId,
  entidad: AuditEntidad,
  entidadId: string,
): Query<IAuditEventDocument[], IAuditEventDocument> {
  return findScoped(AuditEvent, tenantId, { entidad, entidadId }).sort({ createdAt: -1 });
}

export async function listAuditEvents(
  tenantId: TenantId,
  entidad: AuditEntidad,
  entidadId: string,
  page: number,
  limit: number,
): Promise<{ data: IAuditEventResponse[]; page: number; limit: number; total: number }> {
  const filter = { entidad, entidadId };
  const [docs, total] = await Promise.all([
    listAuditEventsQuery(tenantId, entidad, entidadId)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<IAuditEventDocument[]>(),
    countScoped(AuditEvent, tenantId, filter),
  ]);

  return { data: docs.map(toAuditEventResponse), page, limit, total };
}
