import type { RequestHandler } from 'express';
import type { SafeUser } from '../types/express.js';
import { ROLES_EMPRESA, type RolEmpresa } from '../features/users/user.types.js';

/**
 * Autorización por **rol de empresa** (AUTH-04, ADR 0017). Sustituye a `authorize-subrol`: los
 * usuarios de un tenant siguen siendo `rol: 'admin'` para `authorize`, y lo que distingue qué puede
 * hacer cada uno es `rolEmpresa` (administrador > coordinador > asesor).
 *
 * Ya **no** existe la regla "sin subrol = acceso total": `rolEmpresa` es obligatorio y los tokens
 * emitidos antes de AUTH-04 se traducen en `authenticateJWT` con la misma tabla que la migración.
 */

// AUTH-05 (ADR 0018): los tres roles tienen los mismos accesos; la única diferencia es la gestión de
// usuarios. Se conservan las constantes (y los gates que las usan) para poder volver a restringir
// sin tocar cada ruta.

/** Datos sensibles del contacto (ADR 0006 → 0018): todos los roles. */
export const ROLES_DATOS_SENSIBLES: readonly RolEmpresa[] = ROLES_EMPRESA;

/** Reportes de productividad (ADR 0011 → 0018): todos los roles. */
export const ROLES_REPORTES: readonly RolEmpresa[] = ROLES_EMPRESA;

/** Gestión de usuarios: el coordinador solo sobre su alcance (lo acota el service, no la ruta). */
export const ROLES_GESTION_USUARIOS: readonly RolEmpresa[] = ['administrador', 'coordinador'];

/** Configuración de la empresa y campañas (ADR 0018): todos los roles. */
export const ROLES_CONFIGURACION: readonly RolEmpresa[] = ROLES_EMPRESA;

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
