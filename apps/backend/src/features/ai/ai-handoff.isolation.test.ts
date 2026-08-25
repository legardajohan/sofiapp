import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

// El servicio importa el singleton de AIService (para `classify`), que abre Redis al instanciarse.
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ classify: vi.fn() }),
}));

import {
  getHandoffSettings,
  primerAdminActivo,
  updateHandoffSettings,
} from './ai-handoff.service.js';
import { HandoffSettings } from './ai-handoff.model.js';
import { User } from '../users/user.model.js';
import type { UpdateHandoffSettingsDTO } from './ai-handoff.types.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

function dto(overrides: Partial<UpdateHandoffSettingsDTO> = {}): UpdateHandoffSettingsDTO {
  return {
    activo: true,
    asesorDestinoId: null,
    mensajeTransicion: 'Te paso con un asesor.',
    reglas: {
      explicitRequest: { activa: true, frases: ['hablar con un asesor'] },
      keyword: { activa: false, palabras: [] },
      lowConfidence: { activa: false, umbral: null },
      intentPurchase: { activa: false, nivelMinimo: 'caliente' },
    },
    ...overrides,
  };
}

async function crearAdmin(tenantId: Types.ObjectId, nombre: string, activo = true): Promise<string> {
  const u = await User.create({
    tenantId,
    nombre,
    email: `${nombre.toLowerCase()}-${new Types.ObjectId().toString()}@x.com`,
    passwordHash: 'x',
    rol: 'admin',
    activo,
  });
  return (u._id as Types.ObjectId).toString();
}

describe('HU-IA-03 — aislamiento multi-tenant de la configuración de handoff', () => {
  beforeEach(async () => {
    await HandoffSettings.deleteMany({});
    await User.deleteMany({});
  });

  it('un tenant sin configuración recibe los valores de fábrica, sin lanzar', async () => {
    const s = await getHandoffSettings(tenantA.toString());

    expect(s.heredado).toBe(true);
    expect(s.activo).toBe(false);
    // Todo apagado de fábrica: la historia no puede cambiarle el comportamiento a nadie.
    expect(Object.values(s.reglas).every((r) => r.activa === false)).toBe(true);
  });

  it('la configuración de tenantA no se lee con el tenant de B', async () => {
    await updateHandoffSettings(tenantA.toString(), dto({ mensajeTransicion: 'Solo de A' }));

    const deB = await getHandoffSettings(tenantB.toString());
    expect(deB.heredado).toBe(true);
    expect(deB.mensajeTransicion).not.toBe('Solo de A');
  });

  it('el PUT de tenantB crea la suya y no pisa la de tenantA', async () => {
    await updateHandoffSettings(tenantA.toString(), dto({ mensajeTransicion: 'De A' }));
    await updateHandoffSettings(tenantB.toString(), dto({ mensajeTransicion: 'De B' }));

    expect((await getHandoffSettings(tenantA.toString())).mensajeTransicion).toBe('De A');
    expect((await getHandoffSettings(tenantB.toString())).mensajeTransicion).toBe('De B');
    expect(await HandoffSettings.countDocuments({})).toBe(2);
  });

  it('guardar dos veces actualiza el mismo documento, no crea otro', async () => {
    await updateHandoffSettings(tenantA.toString(), dto({ mensajeTransicion: 'Primera' }));
    await updateHandoffSettings(tenantA.toString(), dto({ mensajeTransicion: 'Segunda' }));

    expect(await HandoffSettings.countDocuments({ tenantId: tenantA })).toBe(1);
    expect((await getHandoffSettings(tenantA.toString())).mensajeTransicion).toBe('Segunda');
  });

  it('no se puede poner como destino a un admin de otro tenant', async () => {
    const adminDeB = await crearAdmin(tenantB, 'AdminB');

    await expect(
      updateHandoffSettings(tenantA.toString(), dto({ asesorDestinoId: adminDeB })),
    ).rejects.toThrow();
    // Y no se escribió nada: la validación va ANTES del upsert.
    expect(await HandoffSettings.countDocuments({ tenantId: tenantA })).toBe(0);
  });

  it('sí acepta a un admin activo del propio tenant', async () => {
    const adminDeA = await crearAdmin(tenantA, 'AdminA');

    const s = await updateHandoffSettings(tenantA.toString(), dto({ asesorDestinoId: adminDeA }));
    expect(s.asesorDestinoId).toBe(adminDeA);
  });

  it('`primerAdminActivo` no cruza la frontera entre tenants', async () => {
    await crearAdmin(tenantB, 'SoloDeB');

    expect(await primerAdminActivo(tenantA.toString())).toBeNull();
    expect(await primerAdminActivo(tenantB.toString())).not.toBeNull();
  });

  it('`primerAdminActivo` ignora a los admins desactivados', async () => {
    await crearAdmin(tenantA, 'Inactivo', false);
    expect(await primerAdminActivo(tenantA.toString())).toBeNull();

    const activo = await crearAdmin(tenantA, 'Activo');
    expect(await primerAdminActivo(tenantA.toString())).toBe(activo);
  });
});
