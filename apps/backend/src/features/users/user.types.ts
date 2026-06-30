import type { Document, Types } from 'mongoose';

export type RolUsuario = 'superadmin' | 'admin' | 'coordinador' | 'asesor';

export interface IUser {
  tenantId: Types.ObjectId | null;
  nombre: string;
  email: string;
  passwordHash: string;
  rol: RolUsuario;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserDocument extends IUser, Document {}

export interface SafeUser {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId | null;
  nombre: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
}
