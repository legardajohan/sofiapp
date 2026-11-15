import type { RolEmpresa, UserRol } from '@/stores/authStore';

/**
 * Roles de empresa (AUTH-04, ADR 0017). Gemelos de `authorize-rol-empresa.middleware.ts` del
 * backend. La UI **oculta**, el backend **decide**: esto sirve para no ofrecer acciones que van a
 * fallar, nunca como única defensa.
 */

type UsuarioConRol = { rol: UserRol; rolEmpresa?: RolEmpresa } | null;

export const ROL_LABEL: Record<UserRol, string> = {
  superadmin: 'Superadministrador',
  admin: 'Usuario de empresa',
};

export const ROL_EMPRESA_LABEL: Record<RolEmpresa, string> = {
  administrador: 'Administrador',
  coordinador: 'Coordinador',
  asesor: 'Asesor',
};

/** Orden de la jerarquía, para listas y selectores. */
export const ROLES_EMPRESA: readonly RolEmpresa[] = ['administrador', 'coordinador', 'asesor'];

/** Etiqueta del rol de una persona: "Administrador", "Coordinador"… o "Superadministrador". */
export function roleLabel(user: { rol: UserRol; rolEmpresa?: RolEmpresa }): string {
  if (user.rol === 'admin' && user.rolEmpresa) return ROL_EMPRESA_LABEL[user.rolEmpresa];
  return ROL_LABEL[user.rol];
}

/** "Juan Pérez · Coordinador". Sin rol conocido, solo el nombre. */
export function nombreConRol(nombre: string, rolEmpresa?: RolEmpresa | null): string {
  return rolEmpresa ? `${nombre} · ${ROL_EMPRESA_LABEL[rolEmpresa]}` : nombre;
}

export function tieneRolEmpresa(user: UsuarioConRol, roles: readonly RolEmpresa[]): boolean {
  return !!user && user.rol === 'admin' && !!user.rolEmpresa && roles.includes(user.rolEmpresa);
}

// AUTH-05 (ADR 0018): los tres roles tienen los mismos accesos; solo la gestión de usuarios difiere.
// Se conservan las constantes para poder volver a restringir sin tocar cada pantalla.

/** Datos sensibles del contacto: todos los roles. */
export const ROLES_DATOS_SENSIBLES: readonly RolEmpresa[] = ROLES_EMPRESA;
/** Reportes de productividad: todos los roles. */
export const ROLES_REPORTES: readonly RolEmpresa[] = ROLES_EMPRESA;
/** Gestión de usuarios: el coordinador solo sobre su equipo y los asesores sin coordinador. */
export const ROLES_GESTION_USUARIOS: readonly RolEmpresa[] = ['administrador', 'coordinador'];
/** Configuración de la empresa y campañas: todos los roles. */
export const ROLES_CONFIGURACION: readonly RolEmpresa[] = ROLES_EMPRESA;

export function puedeVerDatosSensibles(user: UsuarioConRol): boolean {
  return tieneRolEmpresa(user, ROLES_DATOS_SENSIBLES);
}

export function puedeVerReportes(user: UsuarioConRol): boolean {
  return tieneRolEmpresa(user, ROLES_REPORTES);
}

export function puedeGestionarUsuarios(user: UsuarioConRol): boolean {
  return tieneRolEmpresa(user, ROLES_GESTION_USUARIOS);
}

export function puedeConfigurar(user: UsuarioConRol): boolean {
  return tieneRolEmpresa(user, ROLES_CONFIGURACION);
}

export function esAdministrador(user: UsuarioConRol): boolean {
  return tieneRolEmpresa(user, ['administrador']);
}

export function esCoordinador(user: UsuarioConRol): boolean {
  return tieneRolEmpresa(user, ['coordinador']);
}

/** Copy único para explicar por qué un dato está oculto. Se repite en tooltip y en el diálogo. */
export const MOTIVO_DATOS_SENSIBLES = 'Tu usuario no tiene acceso a este dato.';

// ── Jerarquía de gestión (AUTH-05, ADR 0018). Gemelo de `user.permisos.ts` del backend ─────────

type ActorGestion =
  | ({ rol: UserRol; rolEmpresa?: RolEmpresa } & {
      esPrincipal?: boolean;
      puedeGestionarAdministradores?: boolean;
    })
  | null;

/** El principal o un Administrador con el permiso: los únicos que gestionan a otros administradores. */
export function gestionaAdministradores(user: ActorGestion): boolean {
  return (
    esAdministrador(user) && (user?.esPrincipal === true || user?.puedeGestionarAdministradores === true)
  );
}

/** Solo el principal concede o retira el permiso de gestionar administradores. */
export function puedeConcederPermisoAdmin(user: ActorGestion): boolean {
  return esAdministrador(user) && user?.esPrincipal === true;
}

/** Roles que el actor puede crear o asignar, en el orden de la jerarquía. */
export function rolesQuePuedeCrear(user: ActorGestion): readonly RolEmpresa[] {
  if (esCoordinador(user)) return ['asesor'];
  if (!esAdministrador(user)) return [];
  return gestionaAdministradores(user) ? ROLES_EMPRESA : ['coordinador', 'asesor'];
}
