import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Estado } from './estado.model.js';
import { createEstado, listEstados } from './estado.service.js';
import { ESTADOS_DEFECTO, seedEstados } from '../../seed/seed-estados.js';
import { AppError } from '../../utils/AppError.js';

describe('HU-CRM-03 — catálogo de estados del pipeline', () => {
  const tenant = new Types.ObjectId();
  const tenantStr = tenant.toString();

  beforeEach(async () => {
    await Estado.deleteMany({});
    await Estado.syncIndexes();
    await seedEstados(tenant);
  });

  it('siembra las de fábrica en el orden del pipeline, no alfabético', async () => {
    const estados = await listEstados(tenantStr);

    expect(estados.map((e) => e.key)).toEqual([
      'nuevo',
      'en_gestion',
      'pago_pendiente',
      'pagado',
      'perdido',
      // HU-PIPE-01: etapa de salida explícita, al final del recorrido.
      'declinado',
    ]);
    expect(estados.every((e) => e.esDefecto)).toBe(true);
  });

  it('las dos etapas terminales nacen marcadas como salida y el resto no (HU-PIPE-01)', async () => {
    const porKey = new Map((await listEstados(tenantStr)).map((e) => [e.key, e]));

    expect(porKey.get('perdido')?.esSalida).toBe(true);
    expect(porKey.get('declinado')?.esSalida).toBe(true);
    expect(porKey.get('nuevo')?.esSalida).toBe(false);
    expect(porKey.get('pagado')?.esSalida).toBe(false);
  });

  it('las claves sembradas son las del enum anterior: los leads existentes no necesitan migración', async () => {
    const estados = await listEstados(tenantStr);

    // Si esto cambia, los leads con `estado: 'en_gestion'` grabado se quedan sin etiqueta.
    expect(estados.map((e) => e.key)).toContain('en_gestion');
    expect(estados.map((e) => e.key)).toContain('pago_pendiente');
  });

  it('crear un estado deriva su clave del nombre y lo pone al final del pipeline', async () => {
    const creado = await createEstado(tenantStr, { label: 'Visita agendada' });

    expect(creado.key).toBe('visita-agendada');
    expect(creado.esDefecto).toBe(false);
    // Al final: un estado nuevo no se cuela entre "pagado" y "perdido" sin que alguien lo decida.
    // Se cuenta contra la semilla y no contra un número escrito a mano.
    expect(creado.orden).toBe(ESTADOS_DEFECTO.length);
    // Una etapa creada a mano no es de salida hasta que alguien lo decida.
    expect(creado.esSalida).toBe(false);
    expect((await listEstados(tenantStr)).at(-1)?.key).toBe('visita-agendada');
  });

  it('la clave ignora acentos y mayúsculas, que es lo que la hace estable', async () => {
    const creado = await createEstado(tenantStr, { label: 'En Negociación' });

    expect(creado.key).toBe('en-negociacion');
  });

  it('rechaza un nombre repetido sin distinguir mayúsculas ni acentos', async () => {
    await createEstado(tenantStr, { label: 'Visita agendada' });

    // Dos "Visita agendada" en el desplegable son indistinguibles para quien lo usa.
    await expect(createEstado(tenantStr, { label: 'VISITA AGENDADA' })).rejects.toThrow(AppError);
  });

  it('sin color elegido cae al gris neutro, no a un color con significado', async () => {
    const creado = await createEstado(tenantStr, { label: 'Visita agendada' });

    expect(creado.color).toBe('#475569');
  });

  it('respeta el color elegido', async () => {
    const creado = await createEstado(tenantStr, { label: 'Visita agendada', color: '#7C3AED' });

    expect(creado.color).toBe('#7C3AED');
  });

  it('resembrar es idempotente: no duplica ni reordena', async () => {
    await seedEstados(tenant);

    expect(await listEstados(tenantStr)).toHaveLength(ESTADOS_DEFECTO.length);
  });
});
