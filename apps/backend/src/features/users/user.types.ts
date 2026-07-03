import type { Document, Types } from 'mongoose';

export type UserRol = 'superadmin' | 'admin' | 'coordinador' | 'asesor';

export interface IUser {
  tenantId: Types.ObjectId | null;
  nombre: string;
  email: string;
  passwordHash: string;
  rol: UserRol;
  activo: boolean;
}

export interface IUserDocument extends IUser, Document {}

export interface IUserResponse {
  id: string;
  tenantId: string | null;
  nombre: string;
  email: string;
  rol: UserRol;
  activo: boolean;
}
