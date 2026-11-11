import { describe, it, expect } from 'vitest';
import {
  accionesSobre,
  gestionaAdministradores,
  puedeConcederPermisoAdmin,
  puedeGestionar,
  rolesCreables,
  type IObjetivoGestion,
  type ResultadoGestion,
} from './user.permisos.js';
import type { IActorGestion } from './user.types.js';

// AUTH-05 (CA-4…8): la matriz de gestión, sin BD.

const PRINCIPAL: IActorGestion = { sub: 'p', rolEmpresa: 'administrador', esPrincipal: true, puedeGestionarAdministradores: false };
const ADMIN_CON: IActorGestion = { sub: 'ac', rolEmpresa: 'administrador', esPrincipal: false, puedeGestionarAdministradores: true };
const ADMIN_SIN: IActorGestion = { sub: 'as', rolEmpresa: 'administrador', esPrincipal: false, puedeGestionarAdministradores: false };
const COORD: IActorGestion = { sub: 'c', rolEmpresa: 'coordinador', esPrincipal: false, puedeGestionarAdministradores: false };
const ASESOR: IActorGestion = { sub: 'a', rolEmpresa: 'asesor', esPrincipal: false, puedeGestionarAdministradores: false };

const objetivo = (o: Partial<IObjetivoGestion>): IObjetivoGestion => ({
  id: 'x',
  rolEmpresa: 'asesor',
  esPrincipal: false,
  coordinadorId: null,
  ...o,
});

const O_PRINCIPAL = objetivo({ id: 'op', rolEmpresa: 'administrador', esPrincipal: true });
const O_ADMIN = objetivo({ id: 'oa', rolEmpresa: 'administrador' });
const O_COORD = objetivo({ id: 'oc', rolEmpresa: 'coordinador' });
const O_ASESOR_EQUIPO = objetivo({ id: 'oe', coordinadorId: 'c' });
const O_ASESOR_LIBRE = objetivo({ id: 'ol', coordinadorId: null });
const O_ASESOR_AJENO = objetivo({ id: 'ox', coordinadorId: 'otro' });

describe('user.permisos — matriz de gestión (AUTH-05)', () => {
  const objetivos = [O_PRINCIPAL, O_ADMIN, O_COORD, O_ASESOR_EQUIPO, O_ASESOR_LIBRE, O_ASESOR_AJENO];
  const matriz: Array<[string, IActorGestion, ResultadoGestion[]]> = [
    ['principal', PRINCIPAL, ['prohibido', 'ok', 'ok', 'ok', 'ok', 'ok']],
    ['admin con permiso', ADMIN_CON, ['prohibido', 'ok', 'ok', 'ok', 'ok', 'ok']],
    ['admin sin permiso', ADMIN_SIN, ['prohibido', 'prohibido', 'ok', 'ok', 'ok', 'ok']],
    ['coordinador', COORD, ['invisible', 'invisible', 'invisible', 'ok', 'ok', 'invisible']],
    ['asesor', ASESOR, ['invisible', 'invisible', 'invisible', 'invisible', 'invisible', 'invisible']],
  ];

  it.each(matriz)('%s', (_n, actor, esperado) => {
    expect(objetivos.map((o) => puedeGestionar(actor, o))).toEqual(esperado);
  });

  it('roles que cada actor puede crear o asignar', () => {
    expect(rolesCreables(PRINCIPAL)).toEqual(['administrador', 'coordinador', 'asesor']);
    expect(rolesCreables(ADMIN_CON)).toEqual(['administrador', 'coordinador', 'asesor']);
    expect(rolesCreables(ADMIN_SIN)).toEqual(['coordinador', 'asesor']);
    expect(rolesCreables(COORD)).toEqual(['asesor']);
    expect(rolesCreables(ASESOR)).toEqual([]);
  });

  it('solo el principal concede el permiso; el permiso solo sirve a un administrador', () => {
    expect(puedeConcederPermisoAdmin(PRINCIPAL)).toBe(true);
    expect(puedeConcederPermisoAdmin(ADMIN_CON)).toBe(false);
    expect(gestionaAdministradores(ADMIN_CON)).toBe(true);
    expect(gestionaAdministradores({ ...COORD, puedeGestionarAdministradores: true })).toBe(false);
  });

  it('acciones: todas en una fila gestionable; ninguna sobre uno mismo ni sobre lo no gestionable', () => {
    const todas = { editar: true, contrasena: true, estado: true, eliminar: true };
    const ninguna = { editar: false, contrasena: false, estado: false, eliminar: false };
    expect(accionesSobre(PRINCIPAL, O_ADMIN)).toEqual(todas);
    expect(accionesSobre(PRINCIPAL, O_PRINCIPAL)).toEqual(ninguna);
    expect(accionesSobre(ADMIN_SIN, O_ADMIN)).toEqual(ninguna);
    expect(accionesSobre(ADMIN_SIN, objetivo({ id: 'as', rolEmpresa: 'administrador' }))).toEqual(ninguna);
    expect(accionesSobre(COORD, O_ASESOR_LIBRE)).toEqual(todas);
  });
});
