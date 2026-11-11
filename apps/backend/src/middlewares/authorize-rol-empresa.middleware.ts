import type { RequestHandler } from 'express';
import type { SafeUser } from '../types/express.js';
import type { RolEmpresa } from '../features/users/user.types.js';

/**
 * Autorización por **rol de empresa** (AUTH-04, ADR 0017). Sustituye a `authorize-subrol`: los
 * usuarios de un tenant siguen siendo `rol: 'admin'` para `authorize`, y lo que distingue qué puede
 * hacer cada uno es `rolEmpresa` (administrador > coordinador > asesor).
 *
 * Ya **no** existe la regla "sin subrol = acceso total": `rolEmpresa` es obligatorio y los tokens
 * emitidos antes de AUTH-04 se traducen en `authenticateJWT` con la misma tabla que la migración.
 */

/** Datos sensibles del contacto (ADR 0006). AUTH-05 suma al coordinador, acotado a su equipo. */
export const ROLES_DATOS_SENSIBLES: readonly RolEmpresa[] = ['administrador'];

/** Reportes de productividad (ADR 0011). AUTH-05 suma al coordinador, acotado a su equipo. */
export const ROLES_REPORTES: readonly RolEmpresa[] = ['administrador'];

/** Gestión de usuarios: el coordinador solo sobre su equipo (lo acota el service, no la ruta). */
export const ROLES_GESTION_USUARIOS: readonly RolEmpresa[] = ['administrador', 'coordinador'];

/** Configuración de la empresa y campañas. */
export const ROLES_CONFIGURACION: readonly RolEmpresa[] = ['administrador'];

export function tieneRolEmpresa(
  user: Pick<SafeUser, 'rol' | 'rolEmpresa'> | undefined,
  roles: readonly RolEmpresa[],
): boolean {
  return !!user && user.rol === 'admin' && !!user.rolEmpresa && roles.includes(user.rolEmpresa);
}

export function puedeVerDatosSensibles(user: Pick<SafeUser, 'rol' | 'rolEmpresa'>): boolean {
  return tieneRolEmpresa(user, ROLES_DATOS_SENSIBLES);
}

/**
 * Gate a nivel de ruta. Va **después** de `authorize(['admin'])`. Devuelve el mismo cuerpo que
 * `authorize` a propósito: el motivo del rechazo no se detalla.
 */
export function authorizeRolEmpresa(roles: readonly RolEmpresa[]): RequestHandler {
  return (req, res, next) => {
    if (!tieneRolEmpresa(req.user, roles)) {
      res.status(403).json({ message: 'Acceso denegado.' });
      return;
    }
    next();
  };
}
