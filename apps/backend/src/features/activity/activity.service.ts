import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { findOneAndUpdateScoped, findOneScoped } from '../../repositories/base.repository.js';
import { User } from '../users/user.model.js';
import { ActividadAsesor, ActividadCursor } from './activity.model.js';
import { HORA_MS, type IConfigCredito, type ITramoActividad } from './activity.types.js';

/** Código de Mongo para clave duplicada en un índice único. */
const DUPLICATE_KEY = 11000;

function esClaveDuplicada(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === DUPLICATE_KEY;
}

const CONFIG_CREDITO: IConfigCredito = {
  intervaloMs: env.ACTIVITY_HEARTBEAT_MS,
  toleranciaMs: env.ACTIVITY_TOLERANCIA_MS,
};

/**
 * Cuánto tiempo acredita un latido, dado el último latido aceptado del mismo asesor.
 *
 * El latido afirma «estuve activo durante el último intervalo»: sin latido previo, o tras un hueco
 * mayor que `intervalo + tolerancia` (pestaña oculta, equipo suspendido), se acredita un intervalo
 * y nada del hueco. Con un latido reciente se acredita solo lo transcurrido desde él, y eso es lo
 * que hace que dos pestañas latiendo a la vez no sumen el doble.
 */
export function calcularCredito(ultimoMs: number | null, ahoraMs: number, cfg: IConfigCredito): number {
  if (ultimoMs === null) return cfg.intervaloMs;
  const delta = ahoraMs - ultimoMs;
  if (delta <= 0) return 0;
  if (delta > cfg.intervaloMs + cfg.toleranciaMs) return cfg.intervaloMs;
  return delta;
}

/** Reparte el tramo `[ahora − créditoMs, ahora]` entre las horas UTC que toca, en segundos. */
export function repartirPorHora(ahora: Date, creditoMs: number): ITramoActividad[] {
  const tramos: ITramoActividad[] = [];
  const fin = ahora.getTime();
  let cursor = fin - creditoMs;
  while (cursor < fin) {
    const inicioHora = Math.floor(cursor / HORA_MS) * HORA_MS;
    const corte = Math.min(inicioHora + HORA_MS, fin);
    tramos.push({ hora: new Date(inicioHora), segundos: (corte - cursor) / 1000 });
    cursor = corte;
  }
  return tramos;
}

/**
 * Mueve el cursor del asesor a `ahora` y devuelve dónde estaba (`null` si es su primer latido).
 *
 * Una sola operación atómica: dos pestañas que laten a la vez quedan en orden y cada una ve el
 * latido de la otra. `$max` y no `$set` para que un latido que llega tarde no haga retroceder el
 * cursor. La carrera del primer upsert (dos inserciones a la vez) la resuelve el índice único: la
 * perdedora reintenta y ya encuentra el documento.
 */
async function moverCursor(tenantId: string, userId: Types.ObjectId, ahora: Date): Promise<number | null> {
  const mover = async (): Promise<{ ultimoLatido: Date } | null> =>
    findOneAndUpdateScoped(
      ActividadCursor,
      tenantId,
      { userId },
      { $max: { ultimoLatido: ahora } },
      { upsert: true, new: false },
    ).lean<{ ultimoLatido: Date } | null>();

  try {
    const previo = await mover();
    return previo ? previo.ultimoLatido.getTime() : null;
  } catch (err) {
    if (!esClaveDuplicada(err)) throw err;
    const previo = await mover();
    return previo ? previo.ultimoLatido.getTime() : null;
  }
}

/**
 * Registra un latido del asesor (HU-REP-06). `tenantId` y `userId` salen del token; la hora, del
 * reloj del servidor — nada de lo que manda el navegador mueve el crédito.
 *
 * Un usuario inexistente en el tenant o desactivado no acredita nada: su JWT puede seguir vivo hasta
 * 8 h después de que lo den de baja.
 */
export async function registrarLatido(tenantId: string, userId: string, ahora: Date = new Date()): Promise<void> {
  const userOid = new Types.ObjectId(userId);
  const usuario = await findOneScoped(User, tenantId, { _id: userOid })
    .select({ activo: 1 })
    .lean<{ activo?: boolean } | null>();
  if (!usuario || usuario.activo === false) return;

  const ultimoMs = await moverCursor(tenantId, userOid, ahora);
  const credito = calcularCredito(ultimoMs, ahora.getTime(), CONFIG_CREDITO);
  if (credito <= 0) return;

  for (const tramo of repartirPorHora(ahora, credito)) {
    const inicioTramo = new Date(Math.max(tramo.hora.getTime(), ahora.getTime() - credito));
    await findOneAndUpdateScoped(
      ActividadAsesor,
      tenantId,
      { userId: userOid, hora: tramo.hora },
      {
        $inc: { segundosActivos: tramo.segundos },
        $min: { primerLatido: inicioTramo },
        $max: { ultimoLatido: ahora },
      },
      { upsert: true },
    );
  }
}
