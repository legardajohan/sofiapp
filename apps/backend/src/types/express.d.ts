import { Types } from 'mongoose';
import type { AdminSubrol } from '../features/users/user.types.js';

export interface SafeUser {
  sub: string;
  tenantId: Types.ObjectId | null;
  rol: 'superadmin' | 'admin';
  subrol?: AdminSubrol;
}

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}
