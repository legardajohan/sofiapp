// Periodicidad de facturación del plan (obligatoria desde HU-SAAS-02). El orden es el de
// presentación en la UI, de menor a mayor duración del compromiso.
export const PERIODICIDADES_PLAN = ['mensual', 'trimestral', 'semestral', 'anual'] as const;

export type PeriodicidadPlan = (typeof PERIODICIDADES_PLAN)[number];

// Planes creados antes de que el campo existiera se leen/backfillean como 'mensual'
// (ver `seed/migrate-plan-fields.ts`).
export const PERIODICIDAD_PLAN_DEFAULT: PeriodicidadPlan = 'mensual';

/** Meses que cubre cada periodicidad. Útil para derivar equivalencias de precio. */
export const MESES_POR_PERIODICIDAD: Record<PeriodicidadPlan, number> = {
  mensual: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};
