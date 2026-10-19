import { dashboardAutoRefresh } from '@/hooks/use-dashboard-refresh';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getAdvisorReport } from '../../../api/reports.js';
import type { AdvisorReport, AdvisorReportParams } from '../types/index.js';

const UN_MINUTO = 60 * 1000;

/** Prefijo de la query: lo usa el botón "Actualizar" (HU-REP-05). */
export const ADVISOR_REPORT_KEY = ['reports', 'by-advisor'] as const;

/** Productividad por asesor (HU-REP-01). Conserva el dato anterior al cambiar de periodo. */
export function useAdvisorReport(params: AdvisorReportParams): UseQueryResult<AdvisorReport> {
  return useQuery({
    queryKey: [...ADVISOR_REPORT_KEY, params],
    queryFn: () => getAdvisorReport(params),
    placeholderData: keepPreviousData,
    staleTime: UN_MINUTO,
    ...dashboardAutoRefresh,
  });
}
