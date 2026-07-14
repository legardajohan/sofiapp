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
      enum: ['superadmin', 'admin'],
      required: true,
    },
    subrol: {
      type: String,
      enum: ['director', 'manager', 'coordinator', 'secretary'],
    },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ tenantId: 1, email: 1 });

export const User = model<IUserDocument>('User', UserSchema);
export const UserModel = User;
