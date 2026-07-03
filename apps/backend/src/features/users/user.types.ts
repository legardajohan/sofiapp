<<<<<<< HEAD
import type { Types, Document } from 'mongoose';

export type RolUsuario = 'superadmin' | 'admin' | 'coordinador' | 'asesor';
=======
import type { Document, Types } from 'mongoose';

export type UserRol = 'superadmin' | 'admin' | 'coordinador' | 'asesor';
>>>>>>> develop

export interface IUser {
  tenantId: Types.ObjectId | null;
  nombre: string;
  email: string;
  passwordHash: string;
<<<<<<< HEAD
  rol: RolUsuario;
=======
  rol: UserRol;
>>>>>>> develop
  activo: boolean;
}

export interface IUserDocument extends IUser, Document {}
<<<<<<< HEAD
=======

export interface IUserResponse {
  id: string;
  tenantId: string | null;
  nombre: string;
  email: string;
  rol: UserRol;
  activo: boolean;
}
>>>>>>> develop
