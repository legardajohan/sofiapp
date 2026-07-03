import { Schema, model } from 'mongoose';
import type { IUserDocument } from './user.types.js';

const UserSchema = new Schema<IUserDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
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
<<<<<<< HEAD
  { timestamps: true }
);

// ADR 0003: email único global para usuarios de panel
UserSchema.index({ email: 1 }, { unique: true });
// Lookup scoped (NO único)
UserSchema.index({ tenantId: 1, email: 1 });
// Búsqueda por rol
UserSchema.index({ rol: 1 });

export const UserModel = model<IUserDocument>('User', UserSchema);
=======
  { timestamps: true },
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ tenantId: 1, email: 1 });

export const User = model<IUserDocument>('User', UserSchema);
>>>>>>> develop
