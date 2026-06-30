import { Schema, model } from 'mongoose';
import type { IUserDocument } from './user.types.js';

const UserSchema = new Schema<IUserDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    nombre: { type: String, required: true },
    email: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    rol: {
      type: String,
      enum: ['superadmin', 'admin', 'coordinador', 'asesor'],
      required: true,
    },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Email único GLOBAL (ADR 0003 — el login resuelve el tenant por email)
UserSchema.index({ email: 1 }, { unique: true });
// Lookup scoped por tenant (NO único)
UserSchema.index({ tenantId: 1, email: 1 });
// Para localizar al/los superadmin
UserSchema.index({ rol: 1 });

export const UserModel = model<IUserDocument>('User', UserSchema);
