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
    actorId: doc.actorId?.toString() ?? null,
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
 * Filtro de la bitácora, **compartido por la página y por el conteo**: si divergen, el `total`
 * miente — contaría eventos que la página nunca devuelve. Filtrar *después* de paginar rompería
 * el conteo igual, y además daría páginas de tamaño irregular; por eso va en la consulta.
 *
 * `accion` es opcional y aditivo: sin él, el comportamiento es el de siempre (todos los eventos de
 * la entidad). Hace falta porque varias bitácoras comparten `entidad`: la de `lead` acumula
 * también `lead.create`, `lead.update` y `lead.delete` (HU-PIPE-01, HU-CRM-04), y sin filtro la
 * bitácora de clasificaciones de HU-IA-05 traería además las reasignaciones —y, al revés, el
 * historial de asignaciones mostraría filas vacías por cada clasificación.
 *
 * Acepta una lista porque un mismo eje puede registrarse con más de una acción: el historial de
 * asignaciones son dos (la manual y el handoff automático), y el de etapa consulta `lead.estado`
 * junto al `lead.update` con el que se grabó antes de HU-PIPE-01.
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
  // El filtro del `count` tiene que ser el MISMO que el de la query, o el `total` no cuadra con las
  // páginas que se devuelven.
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
