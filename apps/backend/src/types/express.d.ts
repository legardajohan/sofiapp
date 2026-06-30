import type { SafeUser } from '../features/users/user.types.js';

export type { SafeUser };

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}
