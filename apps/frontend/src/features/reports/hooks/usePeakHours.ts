import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getPeakHours } from '../../../api/reports.js';
import type { PeakHours, PeakHoursParams } from '../types/index.js';

const UN_MINUTO = 60 * 1000;

/** Horas pico de mensajería (HU-REP-04). Conserva el dato anterior al cambiar de periodo. */
export function usePeakHours(params: PeakHoursParams): UseQueryResult<PeakHours> {
  return useQuery({
    queryKey: ['reports', 'peak-hours', params],
    queryFn: () => getPeakHours(params),
    placeholderData: keepPreviousData,
    staleTime: UN_MINUTO,
  });
}
