import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getAdvisorReport } from '../../../api/reports.js';
import type { AdvisorReport, AdvisorReportParams } from '../types/index.js';

const UN_MINUTO = 60 * 1000;

/** Productividad por asesor (HU-REP-01). Conserva el dato anterior al cambiar de periodo. */
export function useAdvisorReport(params: AdvisorReportParams): UseQueryResult<AdvisorReport> {
  return useQuery({
    queryKey: ['reports', 'by-advisor', params],
    queryFn: () => getAdvisorReport(params),
    placeholderData: keepPreviousData,
    staleTime: UN_MINUTO,
  });
}
