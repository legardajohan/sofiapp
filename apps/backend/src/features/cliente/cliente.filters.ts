import type { FilterQuery } from 'mongoose';
import type { IClienteDocument } from './cliente.types.js';

/** Prefijo de `metaUserId` de los clientes sembrados por el seed de demo (HU-OMNI-05). */
export const PREFIJO_CLIENTE_DEMO = /^demo-/;

/**
 * Qué es un cliente **real** (HU-IA-08): ni sembrado por el seed de demo ni la conversación de prueba
 * de un admin. Todo lo que alimente bandeja, reportes, pipeline, segmentos, recordatorios o cuotas
 * del plan debe combinar este filtro; un cliente de prueba que se cuela en un conteo falsea cifras
 * de negocio.
 *
 * `esPrueba: { $ne: true }` y no `false`: los documentos anteriores al campo no lo llevan.
 */
export function filtroClientesReales(): FilterQuery<IClienteDocument> {
  return { esPrueba: { $ne: true }, metaUserId: { $not: PREFIJO_CLIENTE_DEMO } };
}

/**
 * Lo mismo para un `$match` de agregación sobre un cliente que llegó por `$lookup` bajo `alias`.
 * El `$lookup` debe proyectar `esPrueba` y `metaUserId`, o este match deja pasar todo.
 */
export function matchClientesReales(alias: string): Record<string, unknown> {
  return {
    [`${alias}.esPrueba`]: { $ne: true },
    [`${alias}.metaUserId`]: { $not: PREFIJO_CLIENTE_DEMO },
  };
}
