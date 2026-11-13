import {
  etiquetaGrupo,
  grupoDeCoordinador,
  parsearGrupoQuery,
  perteneceAlGrupo,
  serializarGrupoQuery,
  type DestinoAsignacion,
  type GrupoUsuarios,
} from '@sofiapp/shared';
import type { RolEmpresa } from '@/stores/authStore';
import type { UserDTO } from '@/features/users/types';

/**
 * AUTH-06 — Agrupación de usuarios por rol para selectores y filtros. Única regla de presentación:
 * Administradores (el principal primero) → Coordinadores → Asesores, cada sección por nombre, y al
 * final, si se pide, los inactivos. Quién es miembro de un grupo para ASIGNAR lo decide el backend.
 */

export interface SeccionUsuarios {
  clave: RolEmpresa | 'inactivos';
  etiqueta: string;
  usuarios: UserDTO[];
}

const ORDEN: readonly RolEmpresa[] = ['administrador', 'coordinador', 'asesor'];

const ETIQUETA: Record<RolEmpresa, string> = {
  administrador: 'Administradores',
  coordinador: 'Coordinadores',
  asesor: 'Asesores',
};

const porNombre = (a: UserDTO, b: UserDTO): number => a.nombre.localeCompare(b.nombre, 'es');

export function agruparPorRol(
  usuarios: readonly UserDTO[],
  opciones: { incluirInactivos?: boolean } = {},
): SeccionUsuarios[] {
  const activos = usuarios.filter((u) => u.activo);
  const secciones: SeccionUsuarios[] = ORDEN.map((rol) => ({
    clave: rol,
    etiqueta: ETIQUETA[rol],
    usuarios: activos
      .filter((u) => (u.rolEmpresa ?? 'asesor') === rol)
      .sort((a, b) => Number(b.esPrincipal) - Number(a.esPrincipal) || porNombre(a, b)),
  }));
  if (opciones.incluirInactivos) {
    secciones.push({
      clave: 'inactivos',
      etiqueta: 'Inactivos',
      usuarios: usuarios.filter((u) => !u.activo).sort(porNombre),
    });
  }
  return secciones.filter((s) => s.usuarios.length > 0);
}

/** Una frase con el destino completo, para confirmar lo elegido de un vistazo. */
export function describirDestino(d: DestinoAsignacion, nombres: ReadonlyMap<string, string>): string {
  const reserva =
    d.reserva.tipo === 'cualquiera'
      ? 'si no hay nadie, a cualquier usuario activo'
      : d.reserva.tipo === 'sin_asignar'
        ? 'si no hay nadie, queda sin asignar'
        : `si no hay nadie, a ${etiquetaGrupo(d.reserva.grupo, nombres).toLowerCase()}`;
  if (d.modo === 'usuario') return `Siempre a ${nombres.get(d.usuarioId) ?? 'la persona elegida'}; ${reserva}.`;
  const quien = etiquetaGrupo(d.grupo, nombres);
  const como =
    d.criterio === 'menor_carga'
      ? 'quien tenga menos conversaciones activas'
      : d.criterio === 'mas_ventas'
        ? 'quien tenga más ventas cerradas en los últimos 30 días'
        : 'el primero por nombre';
  return `${quien}: ${como}${d.soloEnLinea ? ', solo entre quienes están en línea' : ''}; ${reserva}.`;
}

/** Una opción del filtro «rol o grupo»: su valor serializado (sintaxis de `?grupo=`) y su grupo. */
export interface OpcionGrupo {
  valor: string;
  etiqueta: string;
  grupo: GrupoUsuarios;
}

/**
 * AUTH-06 (ajuste) — Las opciones del filtro de rol, en el mismo orden en toda la app: los roles
 * (con «Administradores excepto el principal») y después un «Grupo de [coordinador]» por cada
 * coordinador, que incluye al coordinador y a sus asesores. «Todos» lo pone cada filtro.
 */
export function opcionesDeGrupo(usuarios: readonly UserDTO[]): { roles: OpcionGrupo[]; equipos: OpcionGrupo[] } {
  const roles: GrupoUsuarios[] = [
    { tipo: 'rol', rol: 'administrador' },
    { tipo: 'rol', rol: 'administrador', excluirPrincipal: true },
    { tipo: 'rol', rol: 'coordinador' },
    { tipo: 'rol', rol: 'asesor' },
  ];
  const nombres = new Map(usuarios.map((u) => [u.id, u.nombre]));
  const equipos = usuarios
    .filter((u) => u.rolEmpresa === 'coordinador' && u.activo)
    .sort(porNombre)
    .map((c) => grupoDeCoordinador(c.id));
  const aOpcion = (grupo: GrupoUsuarios): OpcionGrupo => ({
    valor: serializarGrupoQuery(grupo),
    etiqueta: etiquetaGrupo(grupo, nombres),
    grupo,
  });
  return { roles: roles.map(aOpcion), equipos: equipos.map(aOpcion) };
}

/** Los usuarios del grupo `valor` (serializado), por nombre. Sin `valor`, todos. */
export function miembrosDe(usuarios: readonly UserDTO[], valor: string | undefined): UserDTO[] {
  const filtro = valor ? parsearGrupoQuery(valor) : null;
  const lista = !filtro
    ? [...usuarios]
    : filtro.tipo === 'usuario'
      ? usuarios.filter((u) => u.id === filtro.usuarioId)
      : usuarios.filter((u) => perteneceAlGrupo({ ...u, rolEmpresa: u.rolEmpresa ?? null }, filtro));
  return lista.sort(porNombre);
}

export interface FiltroRolUsuario {
  /** Rol o grupo serializado (`rol:asesor`, `equipo:<id>`…); `undefined` = todos. */
  grupo: string | undefined;
  /** Usuario concreto dentro del grupo; solo tiene sentido con un `grupo`. */
  persona: string | undefined;
}

/** El filtro que se manda al backend: la persona manda sobre el grupo. */
export function grupoParaBackend(v: FiltroRolUsuario): string | undefined {
  return v.persona ? `usuario:${v.persona}` : v.grupo;
}
