import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { User } from '../features/users/user.model.js';

export async function seedSuperadmin(): Promise<void> {
  const { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } = env;

  if (!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD son obligatorias en production para sembrar el superadmin.',
      );
    }
    logger.warn('Seed de superadmin omitido: faltan SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD.');
    return;
  }

  const existing = await User.findOne({ email: SUPERADMIN_EMAIL });
  if (existing) {
    logger.info('Superadmin ya existe, se omite el seed.', { email: SUPERADMIN_EMAIL });
    return;
  }

  const passwordHash = await bcrypt.hash(SUPERADMIN_PASSWORD, env.SALT_ROUNDS);
  await User.create({
    nombre: 'Superadmin',
    email: SUPERADMIN_EMAIL,
    passwordHash,
    rol: 'superadmin',
    tenantId: null,
    activo: true,
  });

  logger.info('Superadmin sembrado exitosamente.', { email: SUPERADMIN_EMAIL });
}
