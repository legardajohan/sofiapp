import { Types } from 'mongoose';

export interface SafeUser {
  sub: string;
  tenantId: Types.ObjectId | null;
  rol: 'superadmin' | 'admin' | 'coordinador' | 'asesor';
}

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}
