import { describe, it, expect } from 'vitest';
import bcrypt from 'bcrypt';
import { User } from '../../src/features/users/user.model.js';
import { seedSuperadmin } from '../../src/seed/seed-superadmin.js';
import { env } from '../../src/config/env.js';

describe('seedSuperadmin', () => {
  it('primera llamada crea el superadmin con passwordHash verificable', async () => {
    await seedSuperadmin();

    const user = await User.findOne({ email: env.SUPERADMIN_EMAIL }).select('+passwordHash');

    expect(user).not.toBeNull();
    expect(user!.rol).toBe('superadmin');
    expect(user!.tenantId).toBeNull();
    expect(user!.activo).toBe(true);
    expect(user!.passwordHash).not.toBe(env.SUPERADMIN_PASSWORD);
    await expect(bcrypt.compare(env.SUPERADMIN_PASSWORD!, user!.passwordHash)).resolves.toBe(true);
  });

  it('segunda llamada es idempotente: no duplica el superadmin', async () => {
    await seedSuperadmin();
    await seedSuperadmin();

    const count = await User.countDocuments({ email: env.SUPERADMIN_EMAIL });
    expect(count).toBe(1);
  });
});
