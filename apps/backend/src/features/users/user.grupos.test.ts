import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { parsearGrupoQuery, serializarGrupoQuery, destinoCompleto, etiquetaGrupo, type FiltroGrupo } from '@sofiapp/shared';
import { User } from './user.model.js';
import { crearUsuario } from './user.test-helpers.js';
import { assertDestinoDelTenant, idsDelFiltro, miembrosDelGrupo, validarDestino } from './user.grupos.js';
import { destinoAsignacionBorradorSchema, destinoAsignacionSchema, grupoQuerySchema } from './user.grupos.validation.js';

// AUTH-06 — grupos de usuarios (criterios 1, 2 y 13).

const tenantA = new Types.ObjectId().toString();
const tenantB = new Types.ObjectId().toString();

describe('AUTH-06 — tipos compartidos', () => {
  it('`?grupo=` va y vuelve sin perder nada', () => {
    const id = new Types.ObjectId().toString();
    const casos: FiltroGrupo[] = [
      { tipo: 'todos' },
      { tipo: 'rol', rol: 'asesor' },
      { tipo: 'rol', rol: 'administrador', excluirPrincipal: true },
      { tipo: 'equipo', coordinadorId: id },
      { tipo: 'equipo', coordinadorId: id, incluirCoordinador: true },
      { tipo: 'usuario', usuarioId: id },
    ];
    for (const g of casos) expect(parsearGrupoQuery(serializarGrupoQuery(g))).toEqual(g);
    for (const malo of ['', 'rol:jefe', 'rol:asesor:sin-principal', 'equipo:123', 'usuario:', 'todos:x']) {
      expect(parsearGrupoQuery(malo)).toBeNull();
    }
  });

  it('`destinoCompleto` exige ids en usuario, equipo y reserva', () => {
    const r = { tipo: 'cualquiera' } as const;
    expect(destinoCompleto({ modo: 'usuario', usuarioId: '', reserva: r })).toBe(false);
    expect(
      destinoCompleto({ modo: 'grupo', grupo: { tipo: 'equipo', coordinadorId: '' }, criterio: 'primero', soloEnLinea: false, reserva: r }),
    ).toBe(false);
    expect(
      destinoCompleto({
        modo: 'grupo',
        grupo: { tipo: 'todos' },
        criterio: 'primero',
        soloEnLinea: false,
        reserva: { tipo: 'grupo', grupo: { tipo: 'equipo', coordinadorId: '' } },
      }),
    ).toBe(false);
    expect(destinoCompleto({ modo: 'grupo', grupo: { tipo: 'todos' }, criterio: 'primero', soloEnLinea: false, reserva: r })).toBe(true);
  });

  it('etiquetas legibles', () => {
    expect(etiquetaGrupo({ tipo: 'rol', rol: 'administrador', excluirPrincipal: true })).toBe(
      'Administradores excepto el principal',
    );
    expect(etiquetaGrupo({ tipo: 'equipo', coordinadorId: 'c1', incluirCoordinador: true }, new Map([['c1', 'Carla']]))).toBe(
      'Grupo de Carla',
    );
  });

  it('Zod: estricto exige ids; borrador admite vacíos; solo se excluye al principal de administradores', () => {
    const r = { tipo: 'cualquiera' };
    expect(destinoAsignacionSchema.safeParse({ modo: 'usuario', usuarioId: '', reserva: r }).success).toBe(false);
    expect(destinoAsignacionBorradorSchema.safeParse({ modo: 'usuario', usuarioId: '', reserva: r }).success).toBe(true);
    expect(
      destinoAsignacionSchema.safeParse({
        modo: 'grupo',
        grupo: { tipo: 'rol', rol: 'asesor', excluirPrincipal: true },
        criterio: 'primero',
        soloEnLinea: false,
        reserva: r,
      }).success,
    ).toBe(false);
    // `round_robin` está reservado para la iteración 2.
    expect(
      destinoAsignacionSchema.safeParse({ modo: 'grupo', grupo: { tipo: 'todos' }, criterio: 'round_robin', soloEnLinea: false, reserva: r })
        .success,
    ).toBe(false);
    expect(grupoQuerySchema.safeParse('rol:coordinador').success).toBe(true);
    expect(grupoQuerySchema.safeParse('rol:nadie').success).toBe(false);
  });
});

describe('AUTH-06 — miembros y validación contra el tenant', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  it('`miembrosDelGrupo` devuelve solo activos, por nombre, del rol pedido', async () => {
    await crearUsuario(tenantA, { nombre: 'Zoe', rolEmpresa: 'asesor' });
    await crearUsuario(tenantA, { nombre: 'Ana', rolEmpresa: 'asesor' });
    await crearUsuario(tenantA, { nombre: 'Inés', rolEmpresa: 'asesor', activo: false });
    await crearUsuario(tenantA, { nombre: 'Carla', rolEmpresa: 'coordinador' });
    await crearUsuario(tenantB, { nombre: 'Beto', rolEmpresa: 'asesor' });

    const m = await miembrosDelGrupo(tenantA, { tipo: 'rol', rol: 'asesor' });
    expect(m.map((u) => u.nombre)).toEqual(['Ana', 'Zoe']);
  });

  it('un equipo de otro tenant es vacío al ejecutar y 404 al guardar', async () => {
    const coordB = await crearUsuario(tenantB, { rolEmpresa: 'coordinador' });
    await crearUsuario(tenantB, { rolEmpresa: 'asesor', coordinadorId: coordB.id });

    expect(await miembrosDelGrupo(tenantA, { tipo: 'equipo', coordinadorId: coordB.id })).toEqual([]);
    await expect(
      validarDestino(tenantA, {
        modo: 'grupo',
        grupo: { tipo: 'equipo', coordinadorId: coordB.id },
        criterio: 'primero',
        soloEnLinea: false,
        reserva: { tipo: 'cualquiera' },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('`validarDestino` rechaza usuario de otro tenant y coordinador de reserva inválido', async () => {
    const deB = await crearUsuario(tenantB, { rolEmpresa: 'asesor' });
    const asesorA = await crearUsuario(tenantA, { rolEmpresa: 'asesor' });

    await expect(
      validarDestino(tenantA, { modo: 'usuario', usuarioId: deB.id, reserva: { tipo: 'cualquiera' } }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      validarDestino(tenantA, {
        modo: 'usuario',
        usuarioId: asesorA.id,
        // Un asesor no es coordinador: su "equipo" no existe.
        reserva: { tipo: 'grupo', grupo: { tipo: 'equipo', coordinadorId: asesorA.id } },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      validarDestino(tenantA, { modo: 'usuario', usuarioId: asesorA.id, reserva: { tipo: 'cualquiera' } }),
    ).resolves.toBeUndefined();
  });

  it('`assertDestinoDelTenant` (flujos) acepta inactivos del tenant pero nunca ids de otro', async () => {
    const inactivo = await crearUsuario(tenantA, { rolEmpresa: 'asesor', activo: false });
    const deB = await crearUsuario(tenantB, { rolEmpresa: 'asesor' });

    await expect(
      assertDestinoDelTenant(tenantA, { modo: 'usuario', usuarioId: inactivo.id, reserva: { tipo: 'cualquiera' } }),
    ).resolves.toBeUndefined();
    await expect(
      assertDestinoDelTenant(tenantA, { modo: 'usuario', usuarioId: deB.id, reserva: { tipo: 'cualquiera' } }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('`idsDelFiltro` (reportes) incluye inactivos y da 404 fuera del tenant', async () => {
    const coord = await crearUsuario(tenantA, { rolEmpresa: 'coordinador' });
    const a1 = await crearUsuario(tenantA, { rolEmpresa: 'asesor', coordinadorId: coord.id, activo: false });
    await crearUsuario(tenantA, { rolEmpresa: 'asesor' });
    const deB = await crearUsuario(tenantB, { rolEmpresa: 'coordinador' });

    expect([...(await idsDelFiltro(tenantA, { tipo: 'equipo', coordinadorId: coord.id }))]).toEqual([a1.id]);
    await expect(idsDelFiltro(tenantA, { tipo: 'equipo', coordinadorId: deB.id })).rejects.toMatchObject({ statusCode: 404 });
    await expect(idsDelFiltro(tenantA, { tipo: 'usuario', usuarioId: deB.id })).rejects.toMatchObject({ statusCode: 404 });
  });
});
