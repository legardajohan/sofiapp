import type { FilterQuery } from 'mongoose';
import type { ILeadDocument } from './lead.types.js';

/**
 * Qué es un lead **real** (HU-IA-08): no nació de la conversación de prueba de un admin. Todo
 * listado, tablero, conteo por etapa/semáforo o segmento de campaña debe combinarlo.
 *
 * `$ne: true` y no `false`: los leads anteriores al campo no lo llevan.
 */
export function filtroLeadsReales(): FilterQuery<ILeadDocument> {
  return { esPrueba: { $ne: true } };
}
