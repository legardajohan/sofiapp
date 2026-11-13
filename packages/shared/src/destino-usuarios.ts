/**
 * AUTH-06 — Destinos por rol. Un **grupo de usuarios** describe a quién puede ir una conversación (o a
 * quién filtra un reporte) en términos de la jerarquía de roles de empresa (ADR 0017/0018), y un
 * **destino de asignación** dice cómo elegir dentro del grupo y qué hacer si no hay nadie.
 *
 * Vive en `packages/shared` porque lo consumen tres sitios que no pueden divergir: el resolvedor del
 * backend, los editores del frontend y la validación del grafo de flujos. Todo aquí es puro: quién es
 * miembro de un grupo lo resuelve SIEMPRE el backend contra el tenant del token.
 */

export const ROLES_DESTINO = ['administrador', 'coordinador', 'asesor'] as const;
export type RolEmpresaDestino = (typeof ROLES_DESTINO)[number];

export type GrupoUsuarios =
  | { tipo: 'todos' }
  | { tipo: 'rol'; rol: RolEmpresaDestino; excluirPrincipal?: boolean }
  | { tipo: 'equipo'; coordinadorId: string; incluirCoordinador?: boolean };

/**
 * Cómo se elige dentro del grupo. `round_robin` queda para la iteración 2: añadirlo aquí es ampliar la
 * unión y guardar un cursor, sin migrar lo ya guardado.
 *  - `menor_carga`: menos conversaciones activas.
 *  - `mas_ventas`: más ventas cerradas en los últimos `VENTANA_VENTAS_DIAS` días (ajuste de AUTH-06).
 *  - `primero`: el primero por nombre. Ya no se ofrece en la interfaz, pero lo guardado sigue valiendo.
 */
export const CRITERIOS_DESTINO = ['primero', 'menor_carga', 'mas_ventas'] as const;

/** Ventana del criterio `mas_ventas`, la misma que el periodo por defecto de los reportes. */
export const VENTANA_VENTAS_DIAS = 30;
export type CriterioDestino = (typeof CRITERIOS_DESTINO)[number];

/** Qué pasa cuando el destino no tiene a nadie disponible. */
export type ReservaDestino =
  | { tipo: 'cualquiera' }
  | { tipo: 'grupo'; grupo: GrupoUsuarios }
  | { tipo: 'sin_asignar' };

export type DestinoAsignacion =
  | { modo: 'usuario'; usuarioId: string; reserva: ReservaDestino }
  | {
      modo: 'grupo';
      grupo: GrupoUsuarios;
      criterio: CriterioDestino;
      /** Solo usuarios con actividad reciente (latido de HU-REP-06). */
      soloEnLinea: boolean;
      reserva: ReservaDestino;
    };

/** Filtro de reportes: un grupo o un usuario concreto. */
export type FiltroGrupo = GrupoUsuarios | { tipo: 'usuario'; usuarioId: string };

export const RESERVA_POR_DEFECTO: ReservaDestino = { tipo: 'cualquiera' };

/** Lo que hacía la app antes de AUTH-06 con «El primero del equipo»: el primero de toda la empresa. */
export const DESTINO_POR_DEFECTO: DestinoAsignacion = {
  modo: 'grupo',
  grupo: { tipo: 'todos' },
  criterio: 'primero',
  soloEnLinea: false,
  reserva: RESERVA_POR_DEFECTO,
};

const vacio = (s: string | undefined | null): boolean => !s || s.trim() === '';

/** El «Grupo de [coordinador]»: el coordinador y todos sus asesores. */
export function grupoDeCoordinador(coordinadorId: string): GrupoUsuarios {
  return { tipo: 'equipo', coordinadorId, incluirCoordinador: true };
}

function grupoCompleto(g: GrupoUsuarios): boolean {
  return g.tipo !== 'equipo' || !vacio(g.coordinadorId);
}

/** `true` si el destino tiene todo lo que necesita para resolverse (sin ids vacíos). */
export function destinoCompleto(d: DestinoAsignacion): boolean {
  const reservaOk = d.reserva.tipo !== 'grupo' || grupoCompleto(d.reserva.grupo);
  if (d.modo === 'usuario') return !vacio(d.usuarioId) && reservaOk;
  // Un grupo de coordinador lo incluye siempre a él (ajuste de AUTH-06); ver `grupoDeCoordinador`.
  return grupoCompleto(d.grupo) && reservaOk;
}

const ETIQUETA_ROL_PLURAL: Record<RolEmpresaDestino, string> = {
  administrador: 'Administradores',
  coordinador: 'Coordinadores',
  asesor: 'Asesores',
};

/**
 * Nombre legible del grupo. `nombres` resuelve el id del coordinador a su nombre; sin él se dice
 * «Equipo de un coordinador».
 */
export function etiquetaGrupo(g: FiltroGrupo, nombres?: ReadonlyMap<string, string>): string {
  switch (g.tipo) {
    case 'todos':
      return 'Cualquier usuario';
    case 'rol':
      return g.rol === 'administrador' && g.excluirPrincipal
        ? 'Administradores excepto el principal'
        : ETIQUETA_ROL_PLURAL[g.rol];
    case 'equipo': {
      const nombre = nombres?.get(g.coordinadorId);
      const base = nombre ? `Grupo de ${nombre}` : 'Grupo de un coordinador';
      return g.incluirCoordinador ? base : `${base} (sin el coordinador)`;
    }
    case 'usuario':
      return nombres?.get(g.usuarioId) ?? 'Un usuario';
  }
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * Sintaxis de `?grupo=` en los reportes: `todos` · `rol:<rol>` · `rol:administrador:sin-principal` ·
 * `equipo:<id>` · `equipo:<id>:con-coordinador` · `usuario:<id>`. Texto plano y no JSON para que la
 * URL se pueda leer y compartir.
 */
export function serializarGrupoQuery(g: FiltroGrupo): string {
  switch (g.tipo) {
    case 'todos':
      return 'todos';
    case 'rol':
      return g.rol === 'administrador' && g.excluirPrincipal ? 'rol:administrador:sin-principal' : `rol:${g.rol}`;
    case 'equipo':
      return g.incluirCoordinador ? `equipo:${g.coordinadorId}:con-coordinador` : `equipo:${g.coordinadorId}`;
    case 'usuario':
      return `usuario:${g.usuarioId}`;
  }
}

/** Inversa de `serializarGrupoQuery`. `null` si la cadena no es válida. */
export function parsearGrupoQuery(s: string): FiltroGrupo | null {
  const partes = s.trim().split(':');
  const [tipo, valor, extra] = partes;
  if (tipo === 'todos' && partes.length === 1) return { tipo: 'todos' };
  if (tipo === 'rol' && valor && (ROLES_DESTINO as readonly string[]).includes(valor)) {
    const rol = valor as RolEmpresaDestino;
    if (partes.length === 2) return { tipo: 'rol', rol };
    if (partes.length === 3 && rol === 'administrador' && extra === 'sin-principal') {
      return { tipo: 'rol', rol, excluirPrincipal: true };
    }
    return null;
  }
  if (tipo === 'equipo' && valor && OBJECT_ID.test(valor)) {
    if (partes.length === 2) return { tipo: 'equipo', coordinadorId: valor };
    if (partes.length === 3 && extra === 'con-coordinador') {
      return { tipo: 'equipo', coordinadorId: valor, incluirCoordinador: true };
    }
    return null;
  }
  if (tipo === 'usuario' && valor && OBJECT_ID.test(valor) && partes.length === 2) {
    return { tipo: 'usuario', usuarioId: valor };
  }
  return null;
}

/** Lo mínimo de un usuario para saber si pertenece a un grupo. */
export interface MiembroGrupo {
  id: string;
  rolEmpresa?: RolEmpresaDestino | null;
  coordinadorId: string | null;
  esPrincipal?: boolean;
}

/**
 * ¿Es `u` miembro de `grupo`? Pura y compartida: la usan el backend (asignar, filtrar reportes) y el
 * frontend (las listas «usuarios de este rol») con la MISMA regla. No comprueba que el coordinador de
 * un equipo siga siéndolo: eso lo hace quien llama, una vez por grupo.
 */
export function perteneceAlGrupo(u: MiembroGrupo, grupo: GrupoUsuarios): boolean {
  switch (grupo.tipo) {
    case 'todos':
      return true;
    case 'rol':
      return u.rolEmpresa === grupo.rol && !(grupo.excluirPrincipal && u.esPrincipal);
    case 'equipo':
      return (
        (u.rolEmpresa === 'asesor' && u.coordinadorId === grupo.coordinadorId) ||
        (grupo.incluirCoordinador === true && u.id === grupo.coordinadorId)
      );
  }
}
