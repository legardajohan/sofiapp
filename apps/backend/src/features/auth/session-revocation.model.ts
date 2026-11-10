import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * Lista de revocación de sesiones (AUTH-03, ADR 0016). Un documento por usuario: todo JWT suyo
 * emitido **antes** de `revokedAt` deja de valer. La ausencia de documento significa "sesión
 * válida", así que la colección vive casi vacía y desplegar no cierra la sesión de nadie.
 *
 * Es tenant-scoped como cualquier otra colección: se lee y escribe solo con `*Scoped`.
 */
export interface ISessionRevocation {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  revokedAt: Date;
  /** Cuándo el TTL de Mongo borra el documento: para entonces ningún JWT previo sigue vigente. */
  expiraEn: Date;
}

export interface ISessionRevocationDocument extends ISessionRevocation, Document {}

const SessionRevocationSchema = new Schema<ISessionRevocationDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revokedAt: { type: Date, required: true },
    expiraEn: { type: Date, required: true },
  },
  { timestamps: false },
);

SessionRevocationSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
SessionRevocationSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });

export const SessionRevocation = model<ISessionRevocationDocument>(
  'SessionRevocation',
  SessionRevocationSchema,
  'session_revocations',
);
