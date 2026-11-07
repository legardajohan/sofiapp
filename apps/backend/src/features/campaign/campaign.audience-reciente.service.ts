import type { Types, FilterQuery } from 'mongoose';
import { env } from '../../config/env.js';
import { aggregateScoped } from '../../repositories/base.repository.js';
import { Message } from '../message/message.model.js';
import { getZonaHorariaTenant } from '../tenant/tenant.service.js';
import type { IClienteDocument } from '../cliente/cliente.types.js';
import { resolverRangoAudiencia, type EntradaRango, type RangoResuelto } from './campaign.rango.js';
import {
  aplicarExclusiones,
  previewCoincidencia,
  type IPreviewCoincidencia,
} from './campaign.segment.service.js';

/**
 * Audiencia "mensajes recientes" (HU-MARK-07): los contactos a quienes el tenant les **envió** algo
 * en un rango de fechas. Reutiliza del segmentador de HU-MARK-01 todo lo que no es "quién
 * coincide": exclusiones incondicionales, deduplicación por teléfono, resumen y muestra. Así la regla
 * de a quién NO se le escribe es una sola para los dos tipos de audiencia.
 */

type TenantId = string | Types.ObjectId;

/**
 * Contactos con al menos un saliente en el rango. El `$group` es lo que garantiza que quien
 * recibió diez mensajes cuente una vez (criterio 4).
 *
 * `aggregateScoped` antepone el `$match` del tenant y castea su id: un mensaje de otra empresa no
 * llega ni siquiera al `$group` (criterio 13). Cuenta todo saliente —asesor, bot o campaña—; los
 * entrantes no, la historia habla de "a quienes se les enviaron mensajes".
 */
export async function resolverClientesConSalientes(
  tenantId: TenantId,
  rango: RangoResuelto,
): Promise<Types.ObjectId[]> {
  const filas = await aggregateScoped<{ _id: Types.ObjectId }>(Message, tenantId, [
    { $match: { direccion: 'outbound', createdAt: { $gte: rango.desde, $lte: rango.hasta } } },
    { $group: { _id: '$clienteId' } },
  ]);
  return filas.map((f) => f._id);
}

/** "Lo que coincide", sin quitar a nadie todavía: base del resumen y de las exclusiones. */
export async function construirCoincidenciaMensajesRecientes(
  tenantId: TenantId,
  rango: RangoResuelto,
): Promise<FilterQuery<IClienteDocument>> {
  const ids = await resolverClientesConSalientes(tenantId, rango);
  return { _id: { $in: ids } };
}

/**
 * Filtro definitivo de `Cliente` para esta audiencia: coincidencia + exclusiones incondicionales
 * (opt-out y bloqueados, criterio 5). Es el que usa el envío para materializar.
 */
export async function construirFiltroMensajesRecientes(
  tenantId: TenantId,
  rango: RangoResuelto,
): Promise<FilterQuery<IClienteDocument>> {
  return aplicarExclusiones(await construirCoincidenciaMensajesRecientes(tenantId, rango));
}

export interface IRangoAudienciaResuelto extends RangoResuelto {
  zonaHoraria: string;
}

/** Rango del usuario → instantes exactos en la zona del tenant (criterios 2 y 3). */
export async function resolverRangoDelTenant(
  tenantId: TenantId,
  entrada: EntradaRango,
  ahora: Date = new Date(),
): Promise<IRangoAudienciaResuelto> {
  const zonaHoraria = await getZonaHorariaTenant(tenantId.toString());
  const rango = resolverRangoAudiencia(entrada, zonaHoraria, ahora, env.CAMPAIGN_AUDIENCE_MAX_DAYS);
  return { ...rango, zonaHoraria };
}

/** Conteo, muestra y resumen para un rango ya resuelto. */
export async function previewMensajesRecientes(
  tenantId: TenantId,
  rango: RangoResuelto,
): Promise<IPreviewCoincidencia> {
  return previewCoincidencia(tenantId, await construirCoincidenciaMensajesRecientes(tenantId, rango));
}
