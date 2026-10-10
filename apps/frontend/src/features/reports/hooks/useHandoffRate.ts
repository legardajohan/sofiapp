import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getHandoffRate } from '../../../api/reports.js';
import type { HandoffRate, HandoffRateParams } from '../types/index.js';

const UN_MINUTO = 60 * 1000;

/** Tasa de escalamiento IA → asesor (HU-REP-02). Conserva el dato anterior al cambiar de periodo. */
export function useHandoffRate(params: HandoffRateParams): UseQueryResult<HandoffRate> {
  return useQuery({
    queryKey: ['reports', 'handoff-rate', params],
    queryFn: () => getHandoffRate(params),
    placeholderData: keepPreviousData,
    staleTime: UN_MINUTO,
  });
}
