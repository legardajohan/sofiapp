import { dashboardAutoRefresh } from '@/hooks/use-dashboard-refresh';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getHandoffRate } from '../../../api/reports.js';
import type { HandoffRate, HandoffRateParams } from '../types/index.js';

const UN_MINUTO = 60 * 1000;

/** Prefijo de la query: lo usa el botón "Actualizar" (HU-REP-05). */
export const HANDOFF_RATE_KEY = ['reports', 'handoff-rate'] as const;

/** Tasa de escalamiento IA → asesor (HU-REP-02). Conserva el dato anterior al cambiar de periodo. */
export function useHandoffRate(params: HandoffRateParams): UseQueryResult<HandoffRate> {
  return useQuery({
    queryKey: [...HANDOFF_RATE_KEY, params],
    queryFn: () => getHandoffRate(params),
    placeholderData: keepPreviousData,
    staleTime: UN_MINUTO,
    ...dashboardAutoRefresh,
  });
}
