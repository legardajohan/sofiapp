import { Schema, model } from 'mongoose';
import type { IAuditEventDocument } from './audit.types.js';

// Colección tenant-scoped genérica de auditoría. Se accede SIEMPRE vía *Scoped.
const AuditEventSchema = new Schema<IAuditEventDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    accion: { type: String, required: true },
    entidad: { type: String, required: true },
    entidadId: { type: Schema.Types.ObjectId, required: true },
    antes: { type: Schema.Types.Mixed, default: {} },
    despues: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'audit_events' },
);

AuditEventSchema.index({ tenantId: 1, entidad: 1, entidadId: 1, createdAt: -1 });

export const AuditEvent = model<IAuditEventDocument>('AuditEvent', AuditEventSchema);
