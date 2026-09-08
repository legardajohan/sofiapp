import type { Query, Types } from 'mongoose';
import { createScoped, countScoped, findScoped } from '../../repositories/base.repository.js';
import { logger } from '../../utils/logger.js';
import { AuditEvent } from './audit.model.js';
import type {
  AuditAccion,
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

/**
 * Filtro de la bitácora, **compartido por la página y por el conteo**.
 *
 * Que sea uno solo no es estética: si la consulta paginada filtrara por acción y el `countScoped`
 * no, el `total` contaría eventos que la página nunca devuelve. Y filtrar *después* de paginar
 * —quedándose con las filas que interesan de las 20 traídas— rompería el conteo igual.
 *
 * `accion` admite un array porque un mismo eje puede haberse registrado con más de un nombre a lo
 * largo del tiempo: el historial de etapa consulta `lead.estado` y el `lead.update` con el que se
 * grabó antes de HU-PIPE-01.
 */
function buildAuditFilter(
  entidad: AuditEntidad,
  entidadId: string,
  accion?: AuditAccion | AuditAccion[],
): Record<string, unknown> {
  const filter: Record<string, unknown> = { entidad, entidadId };
  if (accion) filter['accion'] = Array.isArray(accion) ? { $in: accion } : accion;
  return filter;
}

export function listAuditEventsQuery(
  tenantId: TenantId,
  entidad: AuditEntidad,
  entidadId: string,
  accion?: AuditAccion | AuditAccion[],
): Query<IAuditEventDocument[], IAuditEventDocument> {
  return findScoped(AuditEvent, tenantId, buildAuditFilter(entidad, entidadId, accion)).sort({
    createdAt: -1,
  });
}

export async function listAuditEvents(
  tenantId: TenantId,
  entidad: AuditEntidad,
  entidadId: string,
  page: number,
  limit: number,
  accion?: AuditAccion | AuditAccion[],
): Promise<{ data: IAuditEventResponse[]; page: number; limit: number; total: number }> {
  const filter = buildAuditFilter(entidad, entidadId, accion);
  const [docs, total] = await Promise.all([
    listAuditEventsQuery(tenantId, entidad, entidadId, accion)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<IAuditEventDocument[]>(),
    countScoped(AuditEvent, tenantId, filter),
  ]);

  return { data: docs.map(toAuditEventResponse), page, limit, total };
}
