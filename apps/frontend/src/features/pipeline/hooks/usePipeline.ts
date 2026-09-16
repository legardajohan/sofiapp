import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchPipeline } from '../api.js';
import type { PipelineDTO, PipelineFiltros } from '../types.js';

/** Clave de la caché del tablero. Se exporta porque la mutación optimista escribe sobre ella. */
export function pipelineKey(filtros: PipelineFiltros): readonly unknown[] {
  return ['pipeline', filtros];
}

/**
 * El embudo del tenant.
 *
 * `keepPreviousData` como en `useLeads`: al cambiar un filtro, el tablero anterior se queda en
 * pantalla hasta que llega el nuevo. Sin esto, todas las columnas parpadearían a esqueleto por un
 * cambio de responsable.
 */
export function usePipeline(filtros: PipelineFiltros) {
  return useQuery<PipelineDTO>({
    queryKey: pipelineKey(filtros),
    queryFn: () => fetchPipeline(filtros),
    placeholderData: keepPreviousData,
  });
}
