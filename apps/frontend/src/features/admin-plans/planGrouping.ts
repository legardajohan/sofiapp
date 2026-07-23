import { PERIODICIDADES_PLAN, type IPlan, type PeriodicidadPlan } from './types/index.js';

// Títulos de sección por categoría (plural correcto, no derivable del label singular).
const PLAN_GROUP_TITLES: Record<PeriodicidadPlan, string> = {
  mensual: 'Planes mensuales',
  trimestral: 'Planes trimestrales',
  semestral: 'Planes semestrales',
  anual: 'Planes anuales',
};

/** Periodicidad efectiva: los planes antiguos sin el campo se tratan como 'mensual'. */
function periodicidadDe(plan: IPlan): PeriodicidadPlan {
  return plan.periodicidad ?? 'mensual';
}

/**
 * Orden estable dentro de una categoría: precio ascendente y, en empate, nombre alfabético (es).
 * Los planes sin un precio numérico válido quedan al final.
 */
function compararPorPrecioLuegoNombre(a: IPlan, b: IPlan): number {
  const pa = typeof a.precio === 'number' && Number.isFinite(a.precio) ? a.precio : Number.POSITIVE_INFINITY;
  const pb = typeof b.precio === 'number' && Number.isFinite(b.precio) ? b.precio : Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa - pb;
  return a.nombre.localeCompare(b.nombre, 'es');
}

export interface PlanGroup {
  periodicidad: PeriodicidadPlan;
  title: string;
  plans: IPlan[];
}

/**
 * Agrupa los planes por periodicidad en el orden fijo mensual → trimestral → semestral → anual, y
 * ordena cada grupo por precio ascendente (empate: nombre). No depende del orden de entrada ni muta
 * la colección original (`filter` produce un array nuevo antes de `sort`). Las categorías sin planes
 * se omiten del resultado.
 */
export function groupPlansByPeriodicidad(plans: IPlan[]): PlanGroup[] {
  return PERIODICIDADES_PLAN.map((periodicidad) => ({
    periodicidad,
    title: PLAN_GROUP_TITLES[periodicidad],
    plans: plans
      .filter((plan) => periodicidadDe(plan) === periodicidad)
      .sort(compararPorPrecioLuegoNombre),
  })).filter((group) => group.plans.length > 0);
}
