/**
 * Actor sintético para las auditorías que dispara el motor de flujos (efectos `crear_lead`,
 * `asignar_asesor` y `guardar_dato`): no hay un usuario humano detrás. `recordAuditEvent` no valida
 * que `actorId` resuelva a un `User` real (`findUsersByIds` simplemente no lo encuentra), así que el
 * evento queda igual de trazable — solo sin nombre de asesor.
 */
export const ACTOR_SISTEMA_FLUJO = '000000000000000000000000';
