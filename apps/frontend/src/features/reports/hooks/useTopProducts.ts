import { dashboardAutoRefresh } from '@/hooks/use-dashboard-refresh';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getTopProducts } from '../../../api/reports.js';
import type { TopProducts, TopProductsParams } from '../types/index.js';

const UN_MINUTO = 60 * 1000;

/** Prefijo de la query: lo usa el botón "Actualizar" (HU-REP-05). */
export const TOP_PRODUCTS_KEY = ['reports', 'top-products'] as const;

/** Productos más consultados (HU-REP-03). Conserva el dato anterior al cambiar de periodo o de top. */
export function useTopProducts(params: TopProductsParams): UseQueryResult<TopProducts> {
  return useQuery({
    queryKey: [...TOP_PRODUCTS_KEY, params],
    queryFn: () => getTopProducts(params),
    placeholderData: keepPreviousData,
    staleTime: UN_MINUTO,
    ...dashboardAutoRefresh,
  });
}
