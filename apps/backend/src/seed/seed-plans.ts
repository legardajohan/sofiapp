import { logger } from '../utils/logger.js';
import { Plan } from '../features/plan/plan.model.js';
import type { IPlan } from '../features/plan/plan.types.js';

// Planes por defecto — valores PLACEHOLDER de ejemplo.
// La matriz real de límites/precio/rentabilidad se acuerda con el área comercial (HU-SAAS-02).
const DEFAULT_PLANS: IPlan[] = [
  {
    nombre: 'Básico',
    limites: { usuarios: 3, mensajesMes: 1000, leads: 500, campanasMes: 2 },
    precio: 0,
    activo: true,
  },
  {
    nombre: 'Estándar',
    limites: { usuarios: 10, mensajesMes: 5000, leads: 5000, campanasMes: 10 },
    precio: 0,
    activo: true,
  },
  {
    nombre: 'Pro',
    limites: { usuarios: 50, mensajesMes: 50000, leads: 50000, campanasMes: 100 },
    precio: 0,
    activo: true,
  },
];

/** Siembra idempotente de los planes por defecto (no pisa valores ya editados por el superadmin). */
export async function seedPlans(): Promise<void> {
  for (const plan of DEFAULT_PLANS) {
    await Plan.updateOne({ nombre: plan.nombre }, { $setOnInsert: plan }, { upsert: true });
  }
  logger.info('Seed de planes verificado (Básico/Estándar/Pro).');
}
