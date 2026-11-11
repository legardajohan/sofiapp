import { Schema, model } from 'mongoose';
import { ROLES_EMPRESA, type IUserDocument } from './user.types.js';

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
    // AUTH-04: obligatorio para los usuarios de empresa; el superadmin no lo lleva.
    rolEmpresa: {
      type: String,
      enum: [...ROLES_EMPRESA],
      required: function (this: IUserDocument): boolean {
        return this.rol === 'admin';
      },
    },
    // Equipo del asesor. Las reglas (solo asesores, coordinador activo del tenant) viven en el service.
    coordinadorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ tenantId: 1, email: 1 });
UserSchema.index({ tenantId: 1, coordinadorId: 1 });
UserSchema.index({ tenantId: 1, rolEmpresa: 1, activo: 1 });

export const User = model<IUserDocument>('User', UserSchema);
export const UserModel = User;
