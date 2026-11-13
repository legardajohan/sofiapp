import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import type { DestinoAsignacion, GrupoUsuarios, ReservaDestino } from '@sofiapp/shared';
import { createScoped } from '../../repositories/base.repository.js';
import { ActividadCursor } from '../activity/activity.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { EstadoComercial, IClienteDocument } from '../cliente/cliente.types.js';
import { User } from './user.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { Lead } from '../lead/lead.model.js';
import { crearLead } from '../reports/reports.fixtures.js';
import { crearUsuario } from './user.test-helpers.js';
import { destinoDesdeLegado, EN_LINEA_MS, legadoDesdeDestino, resolverDestinoAsignacion } from './user.destino.js';
import type { RolEmpresa } from './user.types.js';

// AUTH-06 — el resolvedor único de «quién recibe la conversación» (criterios 3, 4, 5, 6 y 11).

const tenant = new Types.ObjectId().toString();
const AHORA = new Date('2026-11-11T15:00:00Z');

async function usuario(
  nombre: string,
  rolEmpresa: RolEmpresa,
  opts: { coordinadorId?: string; activo?: boolean; esPrincipal?: boolean } = {},
): Promise<string> {
  const u = await crearUsuario(tenant, { nombre, rolEmpresa, ...opts });
  return u.id;
}

async function conversaciones(asesorId: string, n: number, estado: EstadoComercial = 'en_gestion'): Promise<void> {
  for (let i = 0; i < n; i++) {
    await createScoped(Cliente, tenant, {
      metaUserId: `wa_${new Types.ObjectId().toString()}`,
      telefono: '573000000000',
      canalOrigen: 'whatsapp',
      estadoComercial: estado,
      asesorId: new Types.ObjectId(asesorId),
    } as unknown as Partial<IClienteDocument>);
  }
}

async function latido(userId: string, haceMs: number): Promise<void> {
  await ActividadCursor.create({
    tenantId: new Types.ObjectId(tenant),
    userId: new Types.ObjectId(userId),
    ultimoLatido: new Date(AHORA.getTime() - haceMs),
  });
}

const CUALQUIERA: ReservaDestino = { tipo: 'cualquiera' };

function grupo(
  g: GrupoUsuarios,
  criterio: 'primero' | 'menor_carga' | 'mas_ventas' = 'primero',
  extra: { soloEnLinea?: boolean; reserva?: ReservaDestino } = {},
): DestinoAsignacion {
  return { modo: 'grupo', grupo: g, criterio, soloEnLinea: extra.soloEnLinea ?? false, reserva: extra.reserva ?? CUALQUIERA };
}

const resolver = (d: DestinoAsignacion): Promise<string | null> => resolverDestinoAsignacion(tenant, d, AHORA);

describe('AUTH-06 — resolverDestinoAsignacion', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Cliente.deleteMany({});
    await ActividadCursor.deleteMany({});
    await Lead.deleteMany({});
    await AuditEvent.deleteMany({});
  });

  describe('criterios (CA-3)', () => {
    const venta = (asesorId: string, haceDias: number): Promise<unknown> =>
      crearLead(new Types.ObjectId(tenant), new Types.ObjectId(asesorId), 'pagado', [
        { a: 'pagado', at: new Date(AHORA.getTime() - haceDias * 24 * 60 * 60 * 1000) },
      ]);

    it('`mas_ventas` elige a quien más vendió en los últimos 30 días (empate → por nombre)', async () => {
      const ana = await usuario('Ana', 'asesor');
      const beto = await usuario('Beto', 'asesor');
      const caro = await usuario('Caro', 'asesor');
      await venta(beto, 2);
      await venta(beto, 10);
      await venta(caro, 3);
      // Ventas viejas (fuera de la ventana) no cuentan: con ellas Ana ganaría.
      for (let i = 0; i < 5; i++) await venta(ana, 45);

      expect(await resolver(grupo({ tipo: 'rol', rol: 'asesor' }, 'mas_ventas'))).toBe(beto);
      await venta(caro, 1);
      // 2 a 2: empate, gana el primero por nombre.
      expect(await resolver(grupo({ tipo: 'rol', rol: 'asesor' }, 'mas_ventas'))).toBe(beto);
    });

    it('`mas_ventas` sin ventas de nadie → el primero por nombre', async () => {
      const ana = await usuario('Ana', 'asesor');
      await usuario('Beto', 'asesor');
      expect(await resolver(grupo({ tipo: 'rol', rol: 'asesor' }, 'mas_ventas'))).toBe(ana);
    });

    it('`primero` elige al primero por nombre del rol pedido, no al primero de la empresa', async () => {
      await usuario('Aarón', 'administrador', { esPrincipal: true });
      await usuario('Zoe', 'asesor');
      const bea = await usuario('Bea', 'asesor');

      expect(await resolver(grupo({ tipo: 'rol', rol: 'asesor' }))).toBe(bea);
    });

    it('`menor_carga` cuenta solo los estados vivos y desempata por nombre', async () => {
      const ana = await usuario('Ana', 'asesor');
      const beto = await usuario('Beto', 'asesor');
      const caro = await usuario('Caro', 'asesor');
      await conversaciones(ana, 2);
      await conversaciones(beto, 1);
      await conversaciones(beto, 5, 'pagado'); // cierres: no cuentan
      await conversaciones(caro, 1);

      expect(await resolver(grupo({ tipo: 'rol', rol: 'asesor' }, 'menor_carga'))).toBe(beto);
    });

    it('`menor_carga` no mira a otros roles: un administrador sin carga no gana', async () => {
      await usuario('Admin Libre', 'administrador');
      const ana = await usuario('Ana', 'asesor');
      await conversaciones(ana, 3);

      expect(await resolver(grupo({ tipo: 'rol', rol: 'asesor' }, 'menor_carga'))).toBe(ana);
    });

    it('un grupo con un solo miembro siempre lo elige', async () => {
      const solo = await usuario('Único', 'coordinador');
      await conversaciones(solo, 9);

      expect(await resolver(grupo({ tipo: 'rol', rol: 'coordinador' }, 'menor_carga'))).toBe(solo);
    });

    it('«administradores excepto el principal» salta al principal', async () => {
      await usuario('Aarón', 'administrador', { esPrincipal: true });
      const berta = await usuario('Berta', 'administrador');

      expect(await resolver(grupo({ tipo: 'rol', rol: 'administrador', excluirPrincipal: true }))).toBe(berta);
    });

    it('equipo: asesores del coordinador y, si se pide, el propio coordinador', async () => {
      const coord = await usuario('Zulema', 'coordinador');
      const otro = await usuario('Otro', 'coordinador');
      await usuario('Ana', 'asesor', { coordinadorId: otro });
      const pedro = await usuario('Pedro', 'asesor', { coordinadorId: coord });

      expect(await resolver(grupo({ tipo: 'equipo', coordinadorId: coord }))).toBe(pedro);
      await conversaciones(pedro, 2);
      expect(
        await resolver(grupo({ tipo: 'equipo', coordinadorId: coord, incluirCoordinador: true }, 'menor_carga')),
      ).toBe(coord);
    });
  });

  describe('solo en línea (CA-4)', () => {
    it('considera solo a quien tiene un latido reciente', async () => {
      const ana = await usuario('Ana', 'asesor');
      const beto = await usuario('Beto', 'asesor');
      await latido(ana, EN_LINEA_MS + 60_000); // hace 6 min: fuera
      await latido(beto, 4 * 60_000); // hace 4 min: en línea

      expect(await resolver(grupo({ tipo: 'rol', rol: 'asesor' }, 'primero', { soloEnLinea: true }))).toBe(beto);
    });

    it('si nadie está en línea, aplica la reserva', async () => {
      await usuario('Ana', 'asesor');
      const coord = await usuario('Carla', 'coordinador');

      const d = grupo({ tipo: 'rol', rol: 'asesor' }, 'primero', {
        soloEnLinea: true,
        reserva: { tipo: 'grupo', grupo: { tipo: 'rol', rol: 'coordinador' } },
      });
      expect(await resolver(d)).toBe(coord);
    });
  });

  describe('reserva (CA-5, CA-11)', () => {
    it('grupo vacío + `cualquiera` → el activo de menos carga de la empresa', async () => {
      const admin = await usuario('Admin', 'administrador');
      const coord = await usuario('Coord', 'coordinador');
      await conversaciones(admin, 1);

      expect(await resolver(grupo({ tipo: 'rol', rol: 'asesor' }))).toBe(coord);
    });

    it('grupo de reserva vacío cae a `cualquiera`', async () => {
      const admin = await usuario('Admin', 'administrador');
      const d = grupo({ tipo: 'rol', rol: 'asesor' }, 'primero', {
        reserva: { tipo: 'grupo', grupo: { tipo: 'rol', rol: 'coordinador' } },
      });
      expect(await resolver(d)).toBe(admin);
    });

    it('`sin_asignar` deja la conversación sin dueño', async () => {
      await usuario('Admin', 'administrador');
      expect(await resolver(grupo({ tipo: 'rol', rol: 'asesor' }, 'primero', { reserva: { tipo: 'sin_asignar' } }))).toBeNull();
    });

    it('usuario fijo desactivado → reserva; activo → él', async () => {
      const inactivo = await usuario('Ida', 'asesor', { activo: false });
      const activo = await usuario('Ana', 'asesor');

      expect(await resolver({ modo: 'usuario', usuarioId: inactivo, reserva: CUALQUIERA })).toBe(activo);
      expect(await resolver({ modo: 'usuario', usuarioId: activo, reserva: { tipo: 'sin_asignar' } })).toBe(activo);
      expect(await resolver({ modo: 'usuario', usuarioId: inactivo, reserva: { tipo: 'sin_asignar' } })).toBeNull();
    });

    it('desactivados y eliminados no son miembros de ningún grupo', async () => {
      await usuario('Ana', 'asesor', { activo: false });
      const eliminado = await usuario('Beto', 'asesor');
      await User.updateOne({ _id: eliminado }, { $set: { eliminado: true, activo: false } });

      expect(await resolver(grupo({ tipo: 'rol', rol: 'asesor' }, 'primero', { reserva: { tipo: 'sin_asignar' } }))).toBeNull();
    });

    it('un coordinador que deja de serlo deja su equipo vacío', async () => {
      const coord = await usuario('Carla', 'coordinador');
      await usuario('Pedro', 'asesor', { coordinadorId: coord });
      await User.updateOne({ _id: coord }, { $set: { rolEmpresa: 'administrador' } });

      const d = grupo({ tipo: 'equipo', coordinadorId: coord }, 'primero', { reserva: { tipo: 'sin_asignar' } });
      expect(await resolver(d)).toBeNull();
    });

    it('quien cambia de rol conserva sus conversaciones y entra en el grupo de su rol nuevo', async () => {
      const ana = await usuario('Ana', 'asesor');
      await conversaciones(ana, 2);
      await User.updateOne({ _id: ana }, { $set: { rolEmpresa: 'coordinador' } });

      expect(await Cliente.countDocuments({ asesorId: ana })).toBe(2);
      expect(await resolver(grupo({ tipo: 'rol', rol: 'coordinador' }))).toBe(ana);
      expect(await resolver(grupo({ tipo: 'rol', rol: 'asesor' }, 'primero', { reserva: { tipo: 'sin_asignar' } }))).toBeNull();
    });
  });

  describe('formato previo (CA-6)', () => {
    it('traduce estrategia + asesor a un destino y de vuelta', () => {
      const id = new Types.ObjectId().toString();
      expect(destinoDesdeLegado('primero', null)).toMatchObject({ modo: 'grupo', grupo: { tipo: 'todos' }, criterio: 'primero' });
      expect(destinoDesdeLegado('menor_carga', null)).toMatchObject({ modo: 'grupo', criterio: 'menor_carga' });
      expect(destinoDesdeLegado('fijo', id)).toEqual({ modo: 'usuario', usuarioId: id, reserva: CUALQUIERA });
      expect(destinoDesdeLegado(undefined, id)).toMatchObject({ modo: 'usuario', usuarioId: id });
      expect(destinoDesdeLegado(undefined, null)).toMatchObject({ modo: 'grupo', criterio: 'primero' });

      expect(legadoDesdeDestino({ modo: 'usuario', usuarioId: id, reserva: CUALQUIERA })).toEqual({
        estrategiaDestino: 'fijo',
        asesorDestinoId: id,
      });
      expect(legadoDesdeDestino(grupo({ tipo: 'rol', rol: 'asesor' }, 'menor_carga'))).toEqual({
        estrategiaDestino: 'menor_carga',
        asesorDestinoId: null,
      });
    });
  });
});
