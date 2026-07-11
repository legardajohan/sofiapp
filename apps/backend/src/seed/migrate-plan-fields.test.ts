import { describe, it, expect } from 'vitest';
import { Plan } from '../features/plan/plan.model.js';
import { listPlans } from '../features/plan/plan.service.js';
import {
  planFieldsMigrationReport,
  applyPlanFieldsMigration,
} from './migrate-plan-fields.js';

// Inserta un plan "legacy" saltándose los defaults del schema (como un doc creado antes de la v2).
async function insertarPlanLegacy(nombre: string, usuarios: number): Promise<void> {
  await Plan.collection.insertOne({
    nombre,
    limites: { usuarios, mensajesMes: 1000, leads: 500, campanasMes: 2 },
    precio: 0,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('migrate-plan-fields — backfill de planes antiguos', () => {
  it('el reporte detecta los campos faltantes', async () => {
    await insertarPlanLegacy('Básico', 3);
    const rep = await planFieldsMigrationReport();
    expect(rep.total).toBe(1);
    expect(rep.faltanAdministradores).toBe(1);
    expect(rep.faltanPerfilesPermitidos).toBe(1);
    expect(rep.faltanNumeroVersion).toBe(1);
    expect(rep.sinFotografiaFinanciera).toBe(1);
  });

  it('listPlans NO lanza con un plan legacy y expone defaults seguros', async () => {
    await insertarPlanLegacy('Estándar', 10);
    const [plan] = await listPlans();
    expect(plan?.nombre).toBe('Estándar');
    expect(plan?.limites.administradores).toBeUndefined(); // legacy: aún sin migrar
    expect(plan?.perfilesPermitidos).toEqual([]);
    expect(plan?.numeroVersion).toBe(1);
    expect(plan?.fotografiaFinanciera).toBeUndefined(); // pendiente de cálculo
  });

  it('applyPlanFieldsMigration inicializa los campos sin inventar datos financieros', async () => {
    await insertarPlanLegacy('Pro', 50);
    await applyPlanFieldsMigration();

    const plan = await Plan.findOne({ nombre: 'Pro' }).lean();
    expect(plan?.limites.administradores).toBe(50); // = usuarios (default estructural)
    expect(plan?.perfilesPermitidos).toEqual([]);
    expect(plan?.numeroVersion).toBe(1);
    expect(plan?.fotografiaFinanciera).toBeUndefined(); // NO se fabricó
  });

  it('es idempotente: correr la migración dos veces no cambia nada', async () => {
    await insertarPlanLegacy('Único', 7);
    await applyPlanFieldsMigration();
    const primero = await Plan.findOne({ nombre: 'Único' }).lean();

    const repDespues = await planFieldsMigrationReport();
    expect(repDespues.faltanAdministradores).toBe(0);
    expect(repDespues.faltanPerfilesPermitidos).toBe(0);

    await applyPlanFieldsMigration(); // segunda pasada
    const segundo = await Plan.findOne({ nombre: 'Único' }).lean();
    expect(segundo?.limites.administradores).toBe(primero?.limites.administradores);
    expect(segundo?.numeroVersion).toBe(primero?.numeroVersion);
  });

  it('no sobrescribe un plan que YA tiene los campos', async () => {
    await Plan.create({
      nombre: 'Nuevo',
      limites: { usuarios: 10, administradores: 4, mensajesMes: 1000, leads: 500, campanasMes: 2 },
      perfilesPermitidos: ['vendedor'],
      precio: 100,
    });
    await applyPlanFieldsMigration();

    const plan = await Plan.findOne({ nombre: 'Nuevo' }).lean();
    expect(plan?.limites.administradores).toBe(4); // intacto (no = usuarios)
    expect(plan?.perfilesPermitidos).toEqual(['vendedor']);
  });
});
