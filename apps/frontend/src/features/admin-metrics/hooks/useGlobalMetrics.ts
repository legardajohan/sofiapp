import { dashboardAutoRefresh } from '@/hooks/use-dashboard-refresh';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getGlobalMetrics } from '../../../api/admin-metrics.js';
import type { GlobalMetrics, GlobalMetricsParams } from '../types/index.js';

const UN_MINUTO = 60 * 1000;

/** Prefijo de la query: lo comparten el tablero y `TopTenantsChart`, y lo usa "Actualizar". */
export const GLOBAL_METRICS_KEY = ['admin', 'metrics', 'global'] as const;

/**
 * Tablero global del SaaS (HU-SAAS-03). Al cambiar filtros conserva el dato anterior mientras
 * llega el nuevo (`keepPreviousData`), para que las gráficas no parpadeen a vacío.
 */
export function useGlobalMetrics(params: GlobalMetricsParams): UseQueryResult<GlobalMetrics> {
  return useQuery({
    queryKey: [...GLOBAL_METRICS_KEY, params],
    queryFn: () => getGlobalMetrics(params),
    placeholderData: keepPreviousData,
    staleTime: UN_MINUTO,
    ...dashboardAutoRefresh,
  });
}
