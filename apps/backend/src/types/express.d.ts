import type { Types } from 'mongoose';

export interface SafeUser {
  _id: string;
  tenantId: Types.ObjectId | null;
  email: string;
  nombre: string;
  rol: 'superadmin' | 'admin' | 'coordinador' | 'asesor';
  activo: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}
