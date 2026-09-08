import type { Document, Types } from 'mongoose';

export type AuditAccion =
  | 'conversation.assign'
  | 'cliente.update'
  | 'contact-note.create'
  | 'lead.create'
  | 'lead.update'
  | 'lead.delete'
  // Cambio de etapa del pipeline (HU-PIPE-01). Accion propia y no 'lead.update' para que el
  // historial de etapa se pueda consultar sin que se le cuelen las altas y las bajas.
  | 'lead.estado';
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
