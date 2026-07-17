import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { Plan } from '../features/plan/plan.model.js';
import { PERIODICIDAD_PLAN_DEFAULT } from '../features/plan/plan.constants.js';

// Migración/backfill IDEMPOTENTE de planes creados antes de la ampliación HU-SAAS-02 v2.
//
// Qué hace (solo sobre documentos a los que les FALTA el campo; nunca sobrescribe lo existente):
//   - `limites.administradores` → se inicializa con `limites.usuarios` (default ESTRUCTURAL, no un
//     costo; el superadmin puede ajustarlo). No se inventa ningún valor financiero.
//   - `perfilesPermitidos`      → `[]`.
//   - `periodicidad`            → `'mensual'` (default estructural; el superadmin puede ajustarlo).
//   - `numeroVersion`           → `1`.
//   - `fotografiaFinanciera`    → NO se toca: queda "pendiente de cálculo" hasta que exista TRM +
//     catálogo de costos y se genere con una nueva versión del plan.
//
// Uso (NO se ejecuta en el arranque de la app):
//   pnpm --filter @sofiapp/api exec tsx --env-file .env src/seed/migrate-plan-fields.ts           (dry-run)
//   pnpm --filter @sofiapp/api exec tsx --env-file .env src/seed/migrate-plan-fields.ts --apply    (aplica)

export interface PlanMigrationReport {
  total: number;
  faltanAdministradores: number;
  faltanPerfilesPermitidos: number;
  faltanPeriodicidad: number;
  faltanNumeroVersion: number;
  sinFotografiaFinanciera: number; // informativo: financiero pendiente (no se modifica)
}

export async function planFieldsMigrationReport(): Promise<PlanMigrationReport> {
  const [
    total,
    faltanAdministradores,
    faltanPerfilesPermitidos,
    faltanPeriodicidad,
    faltanNumeroVersion,
    sinFotografiaFinanciera,
  ] = await Promise.all([
    Plan.countDocuments({}),
    Plan.countDocuments({ 'limites.administradores': { $exists: false } }),
    Plan.countDocuments({ perfilesPermitidos: { $exists: false } }),
    Plan.countDocuments({ periodicidad: { $exists: false } }),
    Plan.countDocuments({ numeroVersion: { $exists: false } }),
    Plan.countDocuments({ fotografiaFinanciera: { $exists: false } }),
  ]);
  return {
    total,
    faltanAdministradores,
    faltanPerfilesPermitidos,
    faltanPeriodicidad,
    faltanNumeroVersion,
    sinFotografiaFinanciera,
  };
}

/** Aplica el backfill. Idempotente: una segunda ejecución no cambia nada. Devuelve el reporte previo. */
export async function applyPlanFieldsMigration(): Promise<PlanMigrationReport> {
  const antes = await planFieldsMigrationReport();

  // administradores := usuarios (pipeline: usa el valor por documento). Solo donde falta.
  await Plan.updateMany({ 'limites.administradores': { $exists: false } }, [
    { $set: { 'limites.administradores': '$limites.usuarios' } },
  ]);
  await Plan.updateMany(
    { perfilesPermitidos: { $exists: false } },
    { $set: { perfilesPermitidos: [] } },
  );
  await Plan.updateMany(
    { periodicidad: { $exists: false } },
    { $set: { periodicidad: PERIODICIDAD_PLAN_DEFAULT } },
  );
  await Plan.updateMany({ numeroVersion: { $exists: false } }, { $set: { numeroVersion: 1 } });
  // fotografiaFinanciera: intencionalmente NO se toca (pendiente de cálculo).

  return antes;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGODB_URI);
  try {
    const reporte = await planFieldsMigrationReport();
    logger.info('[migrate-plan-fields] Estado actual de los planes', { reporte });

    if (!apply) {
      logger.info(
        '[migrate-plan-fields] DRY-RUN: no se modificó nada. Ejecuta con --apply para aplicar el backfill.',
      );
      return;
    }

    await applyPlanFieldsMigration();
    const despues = await planFieldsMigrationReport();
    logger.info('[migrate-plan-fields] Backfill aplicado', { despues });
  } finally {
    await mongoose.disconnect();
  }
}

// Ejecutar solo cuando se invoca directamente (no al importarse en tests/otros módulos).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
