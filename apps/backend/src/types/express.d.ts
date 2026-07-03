<<<<<<< HEAD
import type { Types } from 'mongoose';

export interface SafeUser {
  _id: string;
  tenantId: Types.ObjectId | null;
  email: string;
  nombre: string;
  rol: 'superadmin' | 'admin' | 'coordinador' | 'asesor';
  activo: boolean;
=======
import { Types } from 'mongoose';

export interface SafeUser {
  sub: string;
  tenantId: Types.ObjectId | null;
  rol: 'superadmin' | 'admin' | 'coordinador' | 'asesor';
>>>>>>> develop
}

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}
