import type { Document, Types } from 'mongoose';

export type AuditAccion =
  | 'conversation.assign'
  | 'conversation.handoff'
  | 'cliente.update'
  /** Clasificación de intención de compra que movió (o propuso mover) el semáforo — HU-IA-05. */
  | 'cliente.semaforo'
  | 'contact-note.create'
  | 'lead.create'
  | 'lead.delete';
export type AuditEntidad = 'cliente' | 'contact-note' | 'lead';

// Colección tenant-scoped genérica de auditoría. Se accede SIEMPRE vía *Scoped.
export interface IAuditEvent {
  tenantId: Types.ObjectId;
  /**
   * Quién lo hizo. `null` significa **el sistema**, no "actor desconocido": hoy solo lo usa el
   * handoff automático de HU-IA-03, que dispara desde el worker sin que ninguna persona haya
   * pulsado nada. Inventar un actor —el primer admin del tenant, por ejemplo— habría dejado en la
   * bitácora que alguien hizo algo que no hizo.
   */
  actorId: Types.ObjectId | null;
  accion: AuditAccion;
  entidad: AuditEntidad;
  entidadId: Types.ObjectId;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
}

export interface IAuditEventDocument extends IAuditEvent, Document {}

export interface IAuditEventResponse {
  id: string;
  /** `null` = acción del sistema (ver `IAuditEvent.actorId`). */
  actorId: string | null;
  accion: AuditAccion;
  entidad: AuditEntidad;
  entidadId: string;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
  createdAt: string;
}

export interface RecordAuditInput {
  /** `null` = acción del sistema (ver `IAuditEvent.actorId`). */
  actorId: string | null;
  accion: AuditAccion;
  entidad: AuditEntidad;
  entidadId: string;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
}
