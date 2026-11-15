import { Types, type ClientSession } from 'mongoose';
import { findOneAndUpdateScoped, findOneScoped } from '../../repositories/base.repository.js';
import { publicarSesionRevocada } from '../../realtime/internal-bus.js';
import { SessionRevocation } from './session-revocation.model.js';

type TenantId = string | Types.ObjectId;

/**
 * Cuánto vive una revocación. Tiene que ser **mayor o igual** que `JWT_EXPIRES_IN` (8h por
 * defecto): pasado ese tiempo ningún token emitido antes de la revocación puede seguir vigente y
 * el documento sobra. Se deja holgado a propósito (ADR 0016).
 */
export const SESSION_REVOCATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Invalida todos los JWT del usuario emitidos hasta ahora. Idempotente (upsert por usuario).
 * Acepta `session` para formar parte de la transacción que desactiva o degrada al usuario.
 * Devuelve el instante de la revocación (AUTH-05: para fechar el token nuevo tras cambiar la
 * propia contraseña después de él).
 */
export async function revokeUserSessions(
  tenantId: TenantId,
  userId: string,
  session?: ClientSession,
): Promise<Date> {
  const ahora = new Date();
  await findOneAndUpdateScoped(
    SessionRevocation,
    tenantId,
    { userId: new Types.ObjectId(userId) },
    { revokedAt: ahora, expiraEn: new Date(ahora.getTime() + SESSION_REVOCATION_TTL_MS) },
    { upsert: true, new: true, ...(session ? { session } : {}) },
  );
  return ahora;
}

/**
 * Avisa a los gateways de Socket.IO para que corten los sockets vivos del usuario. Va aparte de
 * `revokeUserSessions` porque solo debe publicarse **después** de confirmar la transacción.
 */
export async function notifySessionsRevoked(tenantId: string, userId: string): Promise<void> {
  await publicarSesionRevocada({ tenantId, userId });
}

/**
 * `true` si el token (por su `iat`, en segundos) se emitió en o antes de la última revocación.
 * La comparación usa `<=`: `iat` se trunca al segundo, así que un token del mismo segundo que la
 * revocación se trata como previo — falla cerrado.
 */
export async function isTokenRevoked(
  tenantId: TenantId,
  userId: string,
  iat: number | undefined,
): Promise<boolean> {
  if (!Types.ObjectId.isValid(userId)) return true;
  const doc = await findOneScoped(SessionRevocation, tenantId, {
    userId: new Types.ObjectId(userId),
  })
    .select('revokedAt')
    .lean<{ revokedAt: Date } | null>();
  if (!doc) return false;
  // Un token sin `iat` no se puede fechar: si hay revocación, no se le concede el beneficio.
  if (iat === undefined) return true;
  return iat * 1000 <= doc.revokedAt.getTime();
}
