import type { Types, Document } from 'mongoose';

export type RolUsuario = 'superadmin' | 'admin' | 'coordinador' | 'asesor';

export interface IUser {
  tenantId: Types.ObjectId | null;
  nombre: string;
  email: string;
  passwordHash: string;
  rol: RolUsuario;
  activo: boolean;
}

export interface IUserDocument extends IUser, Document {}
