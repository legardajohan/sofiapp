import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { ActividadCursor } from '../activity/activity.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { IClienteDocument } from '../cliente/cliente.types.js';
import { User } from './user.model.js';
import { crearUsuario } from './user.test-helpers.js';
import { cargaPorUsuario, idsEnLinea, resolverDestinoAsignacion, ventasRecientesPorUsuario } from './user.destino.js';
import { crearLead } from '../reports/reports.fixtures.js';

// AUTH-06 — aislamiento multi-tenant del resolvedor (criterio 13; `docs/multi-tenancy.md` §8).

const tenantA = new Types.ObjectId().toString();
const tenantB = new Types.ObjectId().toString();

describe('AUTH-06 — aislamiento del resolvedor de destinos', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Cliente.deleteMany({});
    await ActividadCursor.deleteMany({});
  });

  it('los miembros de otro tenant nunca se eligen, aunque el grupo coincida', async () => {
    await crearUsuario(tenantB, { nombre: 'Aaa de B', rolEmpresa: 'asesor' });
    const deA = await crearUsuario(tenantA, { nombre: 'Zzz de A', rolEmpresa: 'asesor' });

    const elegido = await resolverDestinoAsignacion(tenantA, {
      modo: 'grupo',
      grupo: { tipo: 'rol', rol: 'asesor' },
      criterio: 'primero',
      soloEnLinea: false,
      reserva: { tipo: 'sin_asignar' },
    });
    expect(elegido).toBe(deA.id);
  });

  it('un usuario fijo de otro tenant no se asigna: va a la reserva', async () => {
    const deB = await crearUsuario(tenantB, { rolEmpresa: 'asesor' });
    expect(
      await resolverDestinoAsignacion(tenantA, { modo: 'usuario', usuarioId: deB.id, reserva: { tipo: 'cualquiera' } }),
    ).toBeNull();
  });

  it('la carga y el «en línea» de otro tenant no influyen', async () => {
    const u = await crearUsuario(tenantA, { rolEmpresa: 'asesor' });
    await createScoped(Cliente, tenantB, {
      metaUserId: `wa_${new Types.ObjectId().toString()}`,
      telefono: '573000000000',
      canalOrigen: 'whatsapp',
      estadoComercial: 'en_gestion',
      asesorId: new Types.ObjectId(u.id),
    } as unknown as Partial<IClienteDocument>);
    await ActividadCursor.create({ tenantId: new Types.ObjectId(tenantB), userId: new Types.ObjectId(u.id), ultimoLatido: new Date() });

    expect((await cargaPorUsuario(tenantA)).get(u.id)).toBeUndefined();
    expect((await idsEnLinea(tenantA, [u.id])).size).toBe(0);
    // Ventas cerradas en otro tenant a nombre de este usuario tampoco cuentan para él.
    await crearLead(new Types.ObjectId(tenantB), new Types.ObjectId(u.id), 'pagado', [{ a: 'pagado', at: new Date() }]);
    expect((await ventasRecientesPorUsuario(tenantA)).get(u.id)).toBeUndefined();
    expect((await ventasRecientesPorUsuario(tenantB)).get(u.id)).toBe(1);
  });
});
