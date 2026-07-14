import type { Document, Types } from 'mongoose';

export type UserRol = 'superadmin' | 'admin';
export type AdminSubrol = 'director' | 'manager' | 'coordinator' | 'secretary';

export interface IUser {
  tenantId: Types.ObjectId | null;
  nombre: string;
  email: string;
  passwordHash: string;
  rol: UserRol;
  subrol?: AdminSubrol;
  activo: boolean;
}

export interface IUserDocument extends IUser, Document {}

export interface IUserResponse {
  id: string;
  tenantId: string | null;
  nombre: string;
  email: string;
  rol: UserRol;
  subrol?: AdminSubrol;
  activo: boolean;
}
