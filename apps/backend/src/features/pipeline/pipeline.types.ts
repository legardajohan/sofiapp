import type { IEstadoResponse } from '../estado/estado.types.js';
import type { ILeadListItemResponse } from '../lead/lead.types.js';

/**
 * El embudo de leads agrupado por etapa (HU-PIPE-01).
 *
 * Este feature **no estrena colección**: es un slice de lectura que compone el catálogo `estados`
 * (HU-CRM-03) con los leads del tenant. De ahí que no tenga `.model.ts`.
 */

/** Tope de leads por columna cuando el cliente no pide otro. */
export const PIPELINE_LIMIT_DEFECTO = 20;

/**
 * Tope máximo por columna. Más bajo que el 100 del listado a propósito: aquí el `limit` es **por
 * columna**, así que con diez etapas un `limit=50` ya son 500 leads en una sola respuesta.
 */
export const PIPELINE_LIMIT_MAXIMO = 50;

export interface IPipelineColumnResponse {
  /** La etapa tal cual la devuelve `GET /api/estados`: incluye `color` y `esSalida`. */
  etapa: IEstadoResponse;
  /**
   * Cuántos leads hay en esta etapa **con los filtros aplicados**. No es `leads.length`: la
   * columna trae como mucho `limit` tarjetas y la cabecera necesita el total real para no mentir.
   */
  total: number;
  /** Primera página de la columna, ordenada por `createdAt: -1` igual que la tabla. */
  leads: ILeadListItemResponse[];
}

export interface IPipelineResponse {
  columnas: IPipelineColumnResponse[];
  /** El tope por columna que se aplicó: con él la UI sabe si hay más de lo que muestra. */
  limit: number;
}

/**
 * Filtros del tablero, ya validados y coercidos por Zod. Es `ListLeadsQuery` sin `page` y **sin
 * `estado`**: el tablero agrupa por etapa, así que filtrar por una sola se contradice con lo que
 * la vista hace.
 */
export interface PipelineQuery {
  limit: number;
  asesor?: string;
  semaforo?: string;
  desde?: Date;
  hasta?: Date;
}
