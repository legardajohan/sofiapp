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
      /**
       * Query ya validada/coercionada por Zod (`validate.middleware.ts`). En Express 5
       * `req.query` es un getter que siempre re-parsea el query string crudo, así que las
       * transformaciones de Zod (defaults, coerción numérica/booleana) nunca llegan ahí:
       * los controllers deben leer de aquí, no de `req.query`, cuando el schema define `query`.
       */
      validatedQuery?: Record<string, unknown>;
    }
  }
}
