import { logger } from '../utils/logger.js';
import { Plan } from '../features/plan/plan.model.js';
import type { IPlan } from '../features/plan/plan.types.js';

// Planes por defecto — valores PLACEHOLDER de ejemplo.
// La matriz real de límites/precio/rentabilidad se acuerda con el área comercial (HU-SAAS-02).
const DEFAULT_PLANS: IPlan[] = [
  {
    nombre: 'Básico',
    // `administradores`, `perfilesPermitidos`, `descripcion` y `precio` (USD) son SUGERIDOS.
    descripcion: 'Ideal para empezar: lo esencial para captar y atender tus primeros clientes.',
    limites: { usuarios: 3, administradores: 3, mensajesMes: 1000, leads: 500, campanasMes: 2 },
    perfilesPermitidos: ['vendedor', 'asesor_comercial'],
    precio: 0,
    activo: true,
  },
  {
    nombre: 'Estándar',
    descripcion: 'Para equipos en crecimiento que necesitan más volumen y coordinación.',
    limites: { usuarios: 10, administradores: 10, mensajesMes: 5000, leads: 5000, campanasMes: 10 },
    perfilesPermitidos: ['vendedor', 'asesor_comercial', 'coordinador'],
    precio: 0,
    activo: true,
  },
  {
    nombre: 'Pro',
    descripcion: 'Máxima capacidad: operación comercial completa con todos los perfiles.',
    limites: { usuarios: 50, administradores: 20, mensajesMes: 50000, leads: 50000, campanasMes: 100 },
    perfilesPermitidos: ['vendedor', 'asesor_comercial', 'coordinador', 'director', 'gerente'],
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
