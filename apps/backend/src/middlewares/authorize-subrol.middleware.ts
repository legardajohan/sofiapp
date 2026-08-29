import type { RequestHandler } from 'express';
import type { SafeUser } from '../types/express.js';
import type { AdminSubrol } from '../features/users/user.types.js';

/**
 * Autorización por **subrol** para los datos sensibles del contacto (HU-CRM-02).
 *
 * Es la única excepción al criterio 4 de AUTH-02 ("los subroles no cambian la autorización"), y
 * está acotada a este dominio: ver `docs/adr/0006-subrol-datos-sensibles.md`. La razón es que los
 * dos roles de login (`superadmin` | `admin`) no bastan para "visible solo para roles autorizados"
 * cuando **todos** los usuarios de un tenant son `admin`.
 */

export const SUBROLES_DATOS_SENSIBLES: readonly AdminSubrol[] = ['director', 'manager'];

/**
 * Un `admin` **sin** `subrol` conserva acceso total. No es un descuido: hoy ningún usuario tiene
 * `subrol` asignado (AUTH-02 lo dejó como metadata y nunca hubo UI para asignarlo), así que exigirlo
 * dejaría a todos los tenants fuera de sus propios datos el día del despliegue.
 */
export function puedeVerDatosSensibles(user: SafeUser): boolean {
  if (user.rol !== 'admin') return false;
  if (!user.subrol) return true;
  return SUBROLES_DATOS_SENSIBLES.includes(user.subrol);
}

/**
 * Gate a nivel de ruta. Se usa donde el recurso entero es sensible (las notas), no donde solo lo
 * son algunos campos — ahí el gate va dentro del service, para no quitarle al `coordinator` la
 * edición legítima de los campos no sensibles.
 *
 * Devuelve el mismo cuerpo que `authorize` a propósito: el motivo del rechazo no se detalla.
 */
export function authorizeSubrol(subroles: readonly AdminSubrol[]): RequestHandler {
  return (req, res, next) => {
    const user = req.user;
    if (!user || user.rol !== 'admin' || (user.subrol && !subroles.includes(user.subrol))) {
      res.status(403).json({ message: 'Acceso denegado.' });
      return;
    }
    next();
  };
}
