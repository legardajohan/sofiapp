import type { Document, Types } from 'mongoose';

export type AuditAccion = 'conversation.assign';
export type AuditEntidad = 'cliente';

// Colección tenant-scoped genérica de auditoría. Se accede SIEMPRE vía *Scoped.
export interface IAuditEvent {
  tenantId: Types.ObjectId;
  actorId: Types.ObjectId;
  accion: AuditAccion;
  entidad: AuditEntidad;
  entidadId: Types.ObjectId;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
}

export interface IAuditEventDocument extends IAuditEvent, Document {}

export interface IAuditEventResponse {
  id: string;
  actorId: string;
  accion: AuditAccion;
  entidad: AuditEntidad;
  entidadId: string;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
  createdAt: string;
}

export interface RecordAuditInput {
  actorId: string;
  accion: AuditAccion;
  entidad: AuditEntidad;
  entidadId: string;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
}
