import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getGlobalMetrics } from '../../../api/admin-metrics.js';
import type { GlobalMetrics, GlobalMetricsParams } from '../types/index.js';

const UN_MINUTO = 60 * 1000;

/**
 * Tablero global del SaaS (HU-SAAS-03). Al cambiar filtros conserva el dato anterior mientras
 * llega el nuevo (`keepPreviousData`), para que las gráficas no parpadeen a vacío.
 */
export function useGlobalMetrics(params: GlobalMetricsParams): UseQueryResult<GlobalMetrics> {
  return useQuery({
    queryKey: ['admin', 'metrics', 'global', params],
    queryFn: () => getGlobalMetrics(params),
    placeholderData: keepPreviousData,
    staleTime: UN_MINUTO,
  });
}
