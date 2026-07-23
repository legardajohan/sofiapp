import { describe, it, expect } from 'vitest';
import { groupPlansByPeriodicidad } from './planGrouping.js';
import type { IPlan, PeriodicidadPlan } from './types/index.js';

function makePlan(
  nombre: string,
  precio: number,
  periodicidad?: PeriodicidadPlan,
): IPlan {
  return {
    _id: `id-${nombre}`,
    nombre,
    periodicidad,
    limites: { usuarios: 1, administradores: 1, mensajesMes: 1, leads: 1, campanasMes: 1 },
    precio,
    activo: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('groupPlansByPeriodicidad', () => {
  it('agrupa en el orden fijo mensual → trimestral → semestral → anual', () => {
    const plans = [
      makePlan('A', 100, 'anual'),
      makePlan('S', 100, 'semestral'),
      makePlan('M', 100, 'mensual'),
      makePlan('T', 100, 'trimestral'),
    ];
    const groups = groupPlansByPeriodicidad(plans);
    expect(groups.map((g) => g.periodicidad)).toEqual([
      'mensual',
      'trimestral',
      'semestral',
      'anual',
    ]);
  });

  it('ordena por precio ascendente dentro de cada categoría', () => {
    const plans = [
      makePlan('Caro', 120, 'mensual'),
      makePlan('Barato', 50, 'mensual'),
      makePlan('Medio', 80, 'mensual'),
    ];
    const [mensual] = groupPlansByPeriodicidad(plans);
    expect(mensual?.plans.map((p) => p.precio)).toEqual([50, 80, 120]);
  });

  it('en empate de precio desempata por nombre alfabético (es)', () => {
    const plans = [
      makePlan('Zeta', 100, 'trimestral'),
      makePlan('Alfa', 100, 'trimestral'),
      makePlan('Mango', 100, 'trimestral'),
    ];
    const [trimestral] = groupPlansByPeriodicidad(plans);
    expect(trimestral?.plans.map((p) => p.nombre)).toEqual(['Alfa', 'Mango', 'Zeta']);
  });

  it('omite las categorías sin planes y conserva el orden de las demás', () => {
    const plans = [makePlan('M', 10, 'mensual'), makePlan('A', 10, 'anual')];
    const groups = groupPlansByPeriodicidad(plans);
    expect(groups.map((g) => g.periodicidad)).toEqual(['mensual', 'anual']);
  });

  it('trata un plan sin periodicidad (legacy) como mensual', () => {
    const plans = [makePlan('SinPeriodicidad', 10, undefined)];
    const groups = groupPlansByPeriodicidad(plans);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.periodicidad).toBe('mensual');
  });

  it('no muta el arreglo original ni su orden', () => {
    const plans = [
      makePlan('Caro', 120, 'mensual'),
      makePlan('Barato', 50, 'mensual'),
    ];
    const original = [...plans];
    groupPlansByPeriodicidad(plans);
    expect(plans).toEqual(original);
    expect(plans[0]?.nombre).toBe('Caro'); // sigue primero: no se reordenó in-place
  });

  it('expone el título de sección correcto por categoría', () => {
    const plans = [
      makePlan('M', 10, 'mensual'),
      makePlan('T', 10, 'trimestral'),
      makePlan('S', 10, 'semestral'),
      makePlan('A', 10, 'anual'),
    ];
    const titles = groupPlansByPeriodicidad(plans).map((g) => g.title);
    expect(titles).toEqual([
      'Planes mensuales',
      'Planes trimestrales',
      'Planes semestrales',
      'Planes anuales',
    ]);
  });
});
