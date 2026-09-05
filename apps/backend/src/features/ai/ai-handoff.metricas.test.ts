import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

// El service importa el singleton de AIService (para `classify`), que abre Redis al instanciarse.
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ classify: vi.fn() }),
}));

import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { EstadoComercial, IClienteDocument } from '../cliente/cliente.types.js';
import { User } from '../users/user.model.js';
import { asesorConMenorCarga, metricasPorAsesor } from './ai-handoff.service.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

/** `listTenantUsers` ordena por nombre, así que el nombre decide los empates. */
async function crearAdmin(
  tenantId: Types.ObjectId,
  nombre: string,
  activo = true,
): Promise<string> {
  const doc = await User.create({
    tenantId,
    nombre,
    email: `${nombre.toLowerCase().replace(/\s/g, '')}.${new Types.ObjectId().toString()}@empresa.test`,
    passwordHash: 'x'.repeat(20),
    rol: 'admin',
    activo,
  });
  return String(doc._id);
}

async function crearConversacion(
  tenantId: Types.ObjectId,
  asesorId: string | null,
  estadoComercial: EstadoComercial,
): Promise<void> {
  await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${new Types.ObjectId().toString()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    estadoComercial,
    ...(asesorId ? { asesorId: new Types.ObjectId(asesorId) } : {}),
  } as unknown as Partial<IClienteDocument>);
}

describe('HU-IA-07 — métricas de asignación por asesor', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Cliente.deleteMany({});
  });

  // AC20: un asesor sin trabajo asignado es justo el que hay que ver.
  it('devuelve una fila por admin activo, incluidos los que tienen cero', async () => {
    await crearAdmin(tenantA, 'Ana Ruiz');
    const luis = await crearAdmin(tenantA, 'Luis Peña');
    await crearConversacion(tenantA, luis, 'en_gestion');

    const filas = await metricasPorAsesor(tenantA.toString());

    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f.nombre)).toEqual(['Ana Ruiz', 'Luis Peña']);
    expect(filas[0]!.activas).toBe(0);
    expect(filas[1]!.activas).toBe(1);
  });

  it('no lista a un admin desactivado: no puede recibir conversaciones (AC20)', async () => {
    await crearAdmin(tenantA, 'Ana Ruiz');
    await crearAdmin(tenantA, 'Zoe Baja', false);

    const filas = await metricasPorAsesor(tenantA.toString());

    expect(filas.map((f) => f.nombre)).toEqual(['Ana Ruiz']);
  });

  // AC17: la definición de «activa» es la que gobierna también el reparto.
  it('activas suma los tres estados vivos y excluye pagado y perdido', async () => {
    const ana = await crearAdmin(tenantA, 'Ana Ruiz');
    for (const estado of ['nuevo', 'en_gestion', 'pago_pendiente', 'pagado', 'perdido'] as const) {
      await crearConversacion(tenantA, ana, estado);
    }

    const [fila] = await metricasPorAsesor(tenantA.toString());

    expect(fila!.activas).toBe(3);
    expect(fila!.porEstado).toEqual({
      nuevo: 1,
      en_gestion: 1,
      pago_pendiente: 1,
      pagado: 1,
      perdido: 1,
    });
  });

  it('trae los cinco estados en cero para un asesor sin nada', async () => {
    await crearAdmin(tenantA, 'Ana Ruiz');

    const [fila] = await metricasPorAsesor(tenantA.toString());

    // Que la UI no tenga que distinguir «cero» de «ausente».
    expect(Object.values(fila!.porEstado)).toEqual([0, 0, 0, 0, 0]);
  });

  it('no cuenta las conversaciones sin asesor asignado', async () => {
    await crearAdmin(tenantA, 'Ana Ruiz');
    await crearConversacion(tenantA, null, 'en_gestion');

    expect((await metricasPorAsesor(tenantA.toString()))[0]!.activas).toBe(0);
  });

  // AC23: es lo que garantiza `aggregateScoped`, y aquí se comprueba de punta a punta.
  it('las conversaciones de otro tenant no suman', async () => {
    const ana = await crearAdmin(tenantA, 'Ana Ruiz');
    await crearAdmin(tenantB, 'Ana Ruiz');
    await crearConversacion(tenantA, ana, 'en_gestion');
    // Mismo id de asesor, otro tenant: si el `$match` faltara, esta sumaría en las dos empresas.
    await crearConversacion(tenantB, ana, 'en_gestion');

    const filasA = await metricasPorAsesor(tenantA.toString());
    const filasB = await metricasPorAsesor(tenantB.toString());

    expect(filasA[0]!.activas).toBe(1);
    expect(filasB[0]!.activas).toBe(0);
  });
});

describe('HU-IA-07 — reparto por menor carga', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Cliente.deleteMany({});
  });

  it('elige al admin con menos conversaciones activas (AC16)', async () => {
    const ana = await crearAdmin(tenantA, 'Ana Ruiz');
    const carlos = await crearAdmin(tenantA, 'Carlos Mera');
    await crearConversacion(tenantA, ana, 'nuevo');
    await crearConversacion(tenantA, ana, 'en_gestion');
    await crearConversacion(tenantA, carlos, 'nuevo');

    expect(await asesorConMenorCarga(tenantA.toString())).toBe(carlos);
  });

  /**
   * El reparto tiene que poder explicársele a quien pregunte por qué le llegó a él, y un desempate
   * aleatorio no se puede explicar. `listTenantUsers` ordena por nombre, así que gana Ana.
   */
  it('en un empate gana el primero por nombre (AC16)', async () => {
    const ana = await crearAdmin(tenantA, 'Ana Ruiz');
    const carlos = await crearAdmin(tenantA, 'Carlos Mera');
    await crearConversacion(tenantA, ana, 'nuevo');
    await crearConversacion(tenantA, carlos, 'nuevo');

    expect(await asesorConMenorCarga(tenantA.toString())).toBe(ana);
  });

  it('un admin sin nada asignado gana: es a quien queremos mandarle la siguiente', async () => {
    const ana = await crearAdmin(tenantA, 'Ana Ruiz');
    const zoe = await crearAdmin(tenantA, 'Zoe Vargas');
    await crearConversacion(tenantA, ana, 'nuevo');

    expect(await asesorConMenorCarga(tenantA.toString())).toBe(zoe);
  });

  it('las conversaciones cerradas no pesan (AC17)', async () => {
    const ana = await crearAdmin(tenantA, 'Ana Ruiz');
    const carlos = await crearAdmin(tenantA, 'Carlos Mera');
    // Ana cerró diez, Carlos tiene una viva: la siguiente es para Ana.
    for (let i = 0; i < 10; i += 1) await crearConversacion(tenantA, ana, 'pagado');
    await crearConversacion(tenantA, carlos, 'en_gestion');

    expect(await asesorConMenorCarga(tenantA.toString())).toBe(ana);
  });

  it('sin admins activos devuelve null en vez de lanzar (AC18)', async () => {
    await crearAdmin(tenantA, 'Zoe Baja', false);

    expect(await asesorConMenorCarga(tenantA.toString())).toBeNull();
  });

  it('no mira la carga de otro tenant (AC23)', async () => {
    const ana = await crearAdmin(tenantA, 'Ana Ruiz');
    const carlos = await crearAdmin(tenantA, 'Carlos Mera');
    // Toda la carga de Carlos está en OTRA empresa: aquí sigue estando libre y le toca a él,
    // porque Ana sí tiene una viva en esta.
    await crearConversacion(tenantA, ana, 'nuevo');
    for (let i = 0; i < 5; i += 1) await crearConversacion(tenantB, carlos, 'nuevo');

    expect(await asesorConMenorCarga(tenantA.toString())).toBe(carlos);
  });
});
