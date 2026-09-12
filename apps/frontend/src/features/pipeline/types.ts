import type { EstadoDTO } from '../estados/types.js';
import type { LeadListItemDTO, LeadsFiltros } from '../leads/types.js';

/** Una columna del embudo: la etapa y su primera página de leads (HU-PIPE-01). */
export interface PipelineColumnDTO {
  etapa: EstadoDTO;
  /**
   * Los leads que hay en la etapa con los filtros aplicados. **No es `leads.length`**: la columna
   * trae como mucho `limit` tarjetas, y la cabecera necesita el número real para no mentir.
   */
  total: number;
  leads: LeadListItemDTO[];
}

export interface PipelineDTO {
  columnas: PipelineColumnDTO[];
  /** El tope por columna que aplicó el backend: con él sabemos si estamos mostrando todo. */
  limit: number;
}

/**
 * Filtros del tablero: los mismos del listado menos `page` y `estado`.
 *
 * `estado` no está porque el tablero ya agrupa por etapa; mandarlo es un `400`. `page` tampoco:
 * cada columna trae su primera página y recorrer el resto es trabajo de la tabla.
 */
export type PipelineFiltros = Omit<LeadsFiltros, 'page' | 'estado'>;
