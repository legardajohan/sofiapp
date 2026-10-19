import { dashboardAutoRefresh } from '@/hooks/use-dashboard-refresh';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getPeakHours } from '../../../api/reports.js';
import type { PeakHours, PeakHoursParams } from '../types/index.js';

const UN_MINUTO = 60 * 1000;

/** Prefijo de la query: lo usa el botón "Actualizar" (HU-REP-05). */
export const PEAK_HOURS_KEY = ['reports', 'peak-hours'] as const;

/** Horas pico de mensajería (HU-REP-04). Conserva el dato anterior al cambiar de periodo. */
export function usePeakHours(params: PeakHoursParams): UseQueryResult<PeakHours> {
  return useQuery({
    queryKey: [...PEAK_HOURS_KEY, params],
    queryFn: () => getPeakHours(params),
    placeholderData: keepPreviousData,
    staleTime: UN_MINUTO,
    ...dashboardAutoRefresh,
  });
}
