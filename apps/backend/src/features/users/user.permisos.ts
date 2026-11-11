import { ROLES_EMPRESA, type IAccionesUsuario, type IActorGestion, type RolEmpresa } from './user.types.js';

// Matriz de gestión de usuarios (AUTH-05, ADR 0018). Funciones **puras**: las usan los asserts del
// service y el cálculo de `acciones` del listado, así la UI nunca ofrece algo que el backend rechaza.
//
// | Actor ↓ / Objetivo →  | Principal | Administrador | Coordinador | Asesor (su equipo o sin coord.) | Otro asesor |
// | Principal             | 403       | ✅             | ✅           | ✅                               | ✅           |
// | Admin con permiso     | 403       | ✅             | ✅           | ✅                               | ✅           |
// | Admin sin permiso     | 403       | 403           | ✅           | ✅                               | ✅           |
// | Coordinador           | 404       | 404           | 404         | ✅                               | 404         |
// | Asesor                | (la ruta responde 403)                                                       |

/** Lo mínimo del usuario objetivo que necesita la matriz. */
export interface IObjetivoGestion {
  id: string;
  rolEmpresa: RolEmpresa;
  esPrincipal: boolean;
  coordinadorId: string | null;
}

/** `ok`: puede gestionarlo · `prohibido`: lo ve pero no lo gestiona (403) · `invisible`: no lo ve (404). */
export type ResultadoGestion = 'ok' | 'prohibido' | 'invisible';

/** Principal o administrador con permiso: los únicos que actúan sobre otros administradores. */
export function gestionaAdministradores(actor: IActorGestion): boolean {
  return actor.rolEmpresa === 'administrador' && (actor.esPrincipal || actor.puedeGestionarAdministradores);
}

/** Solo el principal concede o retira el permiso de gestionar administradores. */
export function puedeConcederPermisoAdmin(actor: IActorGestion): boolean {
  return actor.rolEmpresa === 'administrador' && actor.esPrincipal;
}

/** Roles que el actor puede crear (o asignar al cambiar el rol de alguien). */
export function rolesCreables(actor: IActorGestion): readonly RolEmpresa[] {
  if (actor.rolEmpresa === 'coordinador') return ['asesor'];
  if (actor.rolEmpresa !== 'administrador') return [];
  return gestionaAdministradores(actor) ? ROLES_EMPRESA : ['coordinador', 'asesor'];
}

/** Alcance del coordinador: asesores de su equipo y asesores sin coordinador. */
function enAlcanceDelCoordinador(actor: IActorGestion, objetivo: IObjetivoGestion): boolean {
  return (
    objetivo.rolEmpresa === 'asesor' &&
    (objetivo.coordinadorId === null || objetivo.coordinadorId === actor.sub)
  );
}

export function puedeGestionar(actor: IActorGestion, objetivo: IObjetivoGestion): ResultadoGestion {
  if (actor.rolEmpresa === 'coordinador') {
    return enAlcanceDelCoordinador(actor, objetivo) && !objetivo.esPrincipal ? 'ok' : 'invisible';
  }
  if (actor.rolEmpresa !== 'administrador') return 'invisible';
  if (objetivo.esPrincipal) return 'prohibido';
  if (objetivo.rolEmpresa === 'administrador' && !gestionaAdministradores(actor)) return 'prohibido';
  return 'ok';
}

const SIN_ACCIONES: IAccionesUsuario = { editar: false, contrasena: false, estado: false, eliminar: false };

/**
 * Acciones que la UI ofrece sobre una fila. Sobre uno mismo, ninguna: cambiar la propia contraseña
 * va por `PATCH /api/auth/me/password` y el resto (rol, estado, eliminar) no se permite.
 */
export function accionesSobre(actor: IActorGestion, objetivo: IObjetivoGestion): IAccionesUsuario {
  if (actor.sub === objetivo.id) return SIN_ACCIONES;
  if (puedeGestionar(actor, objetivo) !== 'ok') return SIN_ACCIONES;
  return { editar: true, contrasena: true, estado: true, eliminar: true };
}
