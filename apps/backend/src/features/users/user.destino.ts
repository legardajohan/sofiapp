import { Types } from 'mongoose';
import {
  RESERVA_POR_DEFECTO,
  VENTANA_VENTAS_DIAS,
  type CriterioDestino,
  type DestinoAsignacion,
  type GrupoUsuarios,
} from '@sofiapp/shared';
import { aggregateScoped, findScoped } from '../../repositories/base.repository.js';
import { logger } from '../../utils/logger.js';
import { ActividadCursor } from '../activity/activity.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { ventasPorUsuario } from '../reports/reports.service.js';
import { miembrosEntre } from './user.grupos.js';
import { assertAssignableAdmin, listTenantUsers } from './user.service.js';
import type { IUserResponse } from './user.types.js';

/**
 * AUTH-06 — El **único** resolvedor de «quién recibe esta conversación». La transferencia de la IA y
 * los nodos de flujo lo llaman; ninguno reimplementa el reparto.
 *
 *   usuario → si sigue siendo asignable, él; si no, la reserva.
 *   grupo   → miembros → (solo en línea) → criterio; vacío → la reserva.
 *   reserva → `grupo` (sus miembros, sin filtro de en línea; vacío → cualquiera) · `cualquiera` (el
 *             activo de menos carga de la empresa) · `sin_asignar` (null).
 *
 * **No lanza por configuración vieja**: un usuario desactivado o un equipo sin coordinador acaban en
 * la reserva con un `warn`. Un handoff que no asigna deja a un cliente esperando; uno que asigna a la
 * reserva es solo un reparto subóptimo.
 */

type TenantId = string | Types.ObjectId;

/**
 * Estados que cuentan como carga viva. `pagado` y `perdido` son cierres (`docs/domain.md` §3). Una sola
 * definición para el reparto y para el panel «Ver asignación».
 */
export const ESTADOS_ACTIVOS = ['nuevo', 'en_gestion', 'pago_pendiente'] as const;

/** «En línea» = latido de actividad (HU-REP-06) en los últimos 5 minutos. */
export const EN_LINEA_MS = 5 * 60 * 1000;

interface CargaFila {
  _id: Types.ObjectId | null;
  activas: number;
}

/** Conversaciones activas por usuario, en UNA consulta (índices `{tenantId, asesorId}` existentes). */
export async function cargaPorUsuario(tenantId: TenantId): Promise<Map<string, number>> {
  const filas = await aggregateScoped<CargaFila>(Cliente, tenantId, [
    { $match: { asesorId: { $ne: null }, estadoComercial: { $in: [...ESTADOS_ACTIVOS] } } },
    { $group: { _id: '$asesorId', activas: { $sum: 1 } } },
  ]).exec();
  return new Map(filas.map((f) => [String(f._id), f.activas]));
}

/** De `ids`, los que tienen un latido en los últimos `EN_LINEA_MS`. */
export async function idsEnLinea(tenantId: TenantId, ids: string[], ahora: Date = new Date()): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const cursores = await findScoped(ActividadCursor, tenantId, {
    userId: { $in: ids.map((id) => new Types.ObjectId(id)) },
    ultimoLatido: { $gte: new Date(ahora.getTime() - EN_LINEA_MS) },
  })
    .select('userId')
    .lean<Array<{ userId: Types.ObjectId }>>();
  return new Set(cursores.map((c) => String(c.userId)));
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Ventas cerradas por usuario en los últimos `VENTANA_VENTAS_DIAS` días (definición de Reportes). */
export async function ventasRecientesPorUsuario(tenantId: TenantId, ahora: Date = new Date()): Promise<Map<string, number>> {
  return ventasPorUsuario(tenantId, new Date(ahora.getTime() - VENTANA_VENTAS_DIAS * DIA_MS), ahora);
}

/**
 * El candidato con la mejor cifra. Recorre en orden (ya vienen por nombre) y solo cambia si la cifra
 * MEJORA estrictamente: ante un empate gana el que ya estaba, el primero por nombre.
 */
function mejor(candidatos: IUserResponse[], cifra: Map<string, number>, mejora: (a: number, b: number) => boolean): string {
  let elegido = candidatos[0]!;
  let valor = cifra.get(elegido.id) ?? 0;
  for (const c of candidatos.slice(1)) {
    const v = cifra.get(c.id) ?? 0;
    if (mejora(v, valor)) {
      elegido = c;
      valor = v;
    }
  }
  return elegido.id;
}

/** Aplica el criterio sobre candidatos ya ordenados por nombre (desempates explicables, no aleatorios). */
async function elegir(
  tenantId: TenantId,
  criterio: CriterioDestino,
  candidatos: IUserResponse[],
  ahora: Date = new Date(),
): Promise<string | null> {
  const primero = candidatos[0];
  if (!primero) return null;
  if (criterio === 'primero' || candidatos.length === 1) return primero.id;
  if (criterio === 'mas_ventas') {
    return mejor(candidatos, await ventasRecientesPorUsuario(tenantId, ahora), (a, b) => a > b);
  }
  return mejor(candidatos, await cargaPorUsuario(tenantId), (a, b) => a < b);
}

async function aplicarReserva(
  tenantId: TenantId,
  destino: DestinoAsignacion,
  activos: IUserResponse[],
  motivo: string,
): Promise<string | null> {
  const { reserva } = destino;
  logger.warn('Asignación: se aplica la reserva del destino', {
    tenantId: String(tenantId),
    motivo,
    reserva: reserva.tipo,
  });
  if (reserva.tipo === 'sin_asignar') return null;
  if (reserva.tipo === 'grupo') {
    const elegido = await elegir(tenantId, 'menor_carga', miembrosEntre(activos, reserva.grupo));
    if (elegido) return elegido;
  }
  return elegir(tenantId, 'menor_carga', activos);
}

/**
 * A quién va la conversación según `destino`, o `null` si nadie (empresa sin usuarios activos, o
 * reserva `sin_asignar`). Lo usa el worker con el `tenantId` de la conversación.
 */
export async function resolverDestinoAsignacion(
  tenantId: TenantId,
  destino: DestinoAsignacion,
  ahora: Date = new Date(),
): Promise<string | null> {
  if (destino.modo === 'usuario') {
    try {
      await assertAssignableAdmin(String(tenantId), destino.usuarioId);
      return destino.usuarioId;
    } catch {
      const activos = await listTenantUsers(tenantId, { rol: 'admin', activo: true });
      return aplicarReserva(tenantId, destino, activos, 'el usuario configurado ya no es asignable');
    }
  }

  const activos = await listTenantUsers(tenantId, { rol: 'admin', activo: true });
  let candidatos = miembrosEntre(activos, destino.grupo);
  if (candidatos.length === 0) return aplicarReserva(tenantId, destino, activos, 'el grupo no tiene miembros activos');

  if (destino.soloEnLinea) {
    const enLinea = await idsEnLinea(tenantId, candidatos.map((c) => c.id), ahora);
    candidatos = candidatos.filter((c) => enLinea.has(c.id));
    if (candidatos.length === 0) return aplicarReserva(tenantId, destino, activos, 'nadie del grupo está en línea');
  }
  return elegir(tenantId, destino.criterio, candidatos, ahora);
}

const TODOS: GrupoUsuarios = { tipo: 'todos' };

/**
 * Traduce la configuración previa a AUTH-06 (`estrategiaDestino` + `asesorDestinoId`, y los
 * `asesorId`/`notificarAsesorId` de los nodos) a un destino. Sin migración: se aplica al leer.
 */
export function destinoDesdeLegado(
  estrategia: 'primero' | 'menor_carga' | 'fijo' | undefined,
  usuarioId: string | null | undefined,
): DestinoAsignacion {
  const efectiva = estrategia ?? (usuarioId ? 'fijo' : 'primero');
  if (efectiva === 'fijo' && usuarioId) {
    return { modo: 'usuario', usuarioId, reserva: RESERVA_POR_DEFECTO };
  }
  return {
    modo: 'grupo',
    grupo: TODOS,
    criterio: efectiva === 'menor_carga' ? 'menor_carga' : 'primero',
    soloEnLinea: false,
    reserva: RESERVA_POR_DEFECTO,
  };
}

/**
 * Lo contrario, para escribir también el formato viejo durante un release (volver atrás sin perder
 * la configuración). Un grupo que no es «todos» degrada al reparto entre todos con su criterio.
 */
export function legadoDesdeDestino(destino: DestinoAsignacion): {
  estrategiaDestino: 'primero' | 'menor_carga' | 'fijo';
  asesorDestinoId: string | null;
} {
  if (destino.modo === 'usuario') return { estrategiaDestino: 'fijo', asesorDestinoId: destino.usuarioId };
  // `mas_ventas` no existía antes: volver atrás lo degrada al reparto por carga.
  return { estrategiaDestino: destino.criterio === 'primero' ? 'primero' : 'menor_carga', asesorDestinoId: null };
}
