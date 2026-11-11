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

/** Datos sensibles del contacto (ADR 0006). AUTH-05 suma al coordinador, acotado a su equipo. */
export const ROLES_DATOS_SENSIBLES: readonly RolEmpresa[] = ['administrador'];
/** Reportes de productividad (ADR 0011). AUTH-05 suma al coordinador, acotado a su equipo. */
export const ROLES_REPORTES: readonly RolEmpresa[] = ['administrador'];
/** Gestión de usuarios: el coordinador solo sobre su equipo. */
export const ROLES_GESTION_USUARIOS: readonly RolEmpresa[] = ['administrador', 'coordinador'];
/** Configuración de la empresa y campañas. */
export const ROLES_CONFIGURACION: readonly RolEmpresa[] = ['administrador'];

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
export const MOTIVO_DATOS_SENSIBLES = 'Solo un Administrador puede ver este dato.';
