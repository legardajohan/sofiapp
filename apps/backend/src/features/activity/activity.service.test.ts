import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { crearAsesor } from '../reports/reports.fixtures.js';
import { ActividadAsesor } from './activity.model.js';
import { calcularCredito, registrarLatido, repartirPorHora } from './activity.service.js';

/*
 * HU-REP-06 — crédito de cada latido. Los valores por defecto del env: intervalo 60 s, tolerancia 30 s.
 */

const CFG = { intervaloMs: 60_000, toleranciaMs: 30_000 };
const T0 = new Date('2026-09-15T10:00:30Z');
const seg = (s: number): Date => new Date(T0.getTime() + s * 1000);

async function segundosDe(tenantId: Types.ObjectId, userId: Types.ObjectId): Promise<number> {
  const cubetas = await ActividadAsesor.find({ tenantId, userId }).lean();
  return cubetas.reduce((t, c) => t + c.segundosActivos, 0);
}

describe('calcularCredito', () => {
  it('sin latido previo → un intervalo', () => {
    expect(calcularCredito(null, 1_000_000, CFG)).toBe(60_000);
  });

  it('latido reciente → solo lo transcurrido', () => {
    expect(calcularCredito(1_000_000, 1_060_000, CFG)).toBe(60_000);
    expect(calcularCredito(1_000_000, 1_030_000, CFG)).toBe(30_000);
  });

  it('dentro de la tolerancia se acredita el retraso completo', () => {
    expect(calcularCredito(1_000_000, 1_090_000, CFG)).toBe(90_000);
  });

  it('hueco mayor que intervalo + tolerancia → un intervalo, nada del hueco', () => {
    expect(calcularCredito(1_000_000, 1_000_000 + 10 * 60_000, CFG)).toBe(60_000);
  });

  it('latido igual o anterior al último → 0', () => {
    expect(calcularCredito(1_000_000, 1_000_000, CFG)).toBe(0);
    expect(calcularCredito(1_000_000, 999_000, CFG)).toBe(0);
  });
});

describe('repartirPorHora', () => {
  it('un tramo dentro de una hora → una cubeta', () => {
    expect(repartirPorHora(new Date('2026-09-15T10:30:00Z'), 60_000)).toEqual([
      { hora: new Date('2026-09-15T10:00:00Z'), segundos: 60 },
    ]);
  });

  it('un tramo que cruza la hora se parte entre las dos cubetas', () => {
    expect(repartirPorHora(new Date('2026-09-15T10:00:20Z'), 60_000)).toEqual([
      { hora: new Date('2026-09-15T09:00:00Z'), segundos: 40 },
      { hora: new Date('2026-09-15T10:00:00Z'), segundos: 20 },
    ]);
  });
});

describe('registrarLatido', () => {
  const tenantId = new Types.ObjectId();

  it('latidos cada 60 s durante 10 min → 10 min (más el intervalo del primero)', async () => {
    const asesor = await crearAsesor(tenantId, 'Ana');
    for (let i = 0; i <= 10; i += 1) await registrarLatido(tenantId.toString(), asesor.toString(), seg(i * 60));
    // El primero acredita el minuto previo a sí mismo; los diez siguientes, un minuto cada uno.
    expect(await segundosDe(tenantId, asesor)).toBe(11 * 60);
  });

  it('dos pestañas intercaladas cada 30 s durante 10 min no suman el doble', async () => {
    const asesor = await crearAsesor(tenantId, 'Beto');
    // Pestaña A en los segundos pares de 60, pestaña B desfasada 30 s: un latido cada 30 s.
    for (let i = 0; i <= 20; i += 1) await registrarLatido(tenantId.toString(), asesor.toString(), seg(i * 30));
    expect(await segundosDe(tenantId, asesor)).toBe(60 + 10 * 60);
  });

  it('dos pestañas que laten a la vez: el segundo latido no acredita nada', async () => {
    const asesor = await crearAsesor(tenantId, 'Caro');
    await Promise.all([
      registrarLatido(tenantId.toString(), asesor.toString(), seg(0)),
      registrarLatido(tenantId.toString(), asesor.toString(), seg(0)),
    ]);
    expect(await segundosDe(tenantId, asesor)).toBe(60);
  });

  it('un hueco largo (pestaña oculta) no se acredita', async () => {
    const asesor = await crearAsesor(tenantId, 'Dani');
    await registrarLatido(tenantId.toString(), asesor.toString(), seg(0));
    await registrarLatido(tenantId.toString(), asesor.toString(), seg(30 * 60));
    expect(await segundosDe(tenantId, asesor)).toBe(120);
  });

  it('un latido que cruza la hora reparte el crédito entre las dos cubetas', async () => {
    const asesor = await crearAsesor(tenantId, 'Eva');
    await registrarLatido(tenantId.toString(), asesor.toString(), new Date('2026-09-15T10:00:20Z'));
    const cubetas = await ActividadAsesor.find({ tenantId, userId: asesor }).sort({ hora: 1 }).lean();
    expect(cubetas.map((c) => [c.hora.toISOString(), c.segundosActivos])).toEqual([
      ['2026-09-15T09:00:00.000Z', 40],
      ['2026-09-15T10:00:00.000Z', 20],
    ]);
  });

  it('un usuario desactivado no acredita nada', async () => {
    const asesor = await crearAsesor(tenantId, 'Fede', { activo: false });
    await registrarLatido(tenantId.toString(), asesor.toString(), seg(0));
    expect(await ActividadAsesor.countDocuments({ tenantId })).toBe(0);
  });

  it('un usuario que no existe en el tenant no acredita nada', async () => {
    await registrarLatido(tenantId.toString(), new Types.ObjectId().toString(), seg(0));
    expect(await ActividadAsesor.countDocuments({ tenantId })).toBe(0);
  });
});
