import type { Document, Types } from 'mongoose';

export type AuditAccion =
  | 'conversation.assign'
  | 'cliente.update'
  | 'contact-note.create'
  | 'lead.create'
  | 'lead.delete';
export type AuditEntidad = 'cliente' | 'contact-note' | 'lead';

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
