import { dashboardAutoRefresh } from '@/hooks/use-dashboard-refresh';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getAdvisorActivity } from '../../../api/reports.js';
import type { AdvisorActivity, AdvisorActivityParams } from '../types/index.js';
import { ADVISOR_REPORT_KEY } from './useAdvisorReport.js';

const UN_MINUTO = 60 * 1000;

/**
 * Serie de tiempo activo (HU-REP-06). Cuelga de `ADVISOR_REPORT_KEY` para que el botón «Actualizar»
 * del tablero la refresque junto al reporte.
 */
export function useAdvisorActivity(params: AdvisorActivityParams): UseQueryResult<AdvisorActivity> {
  return useQuery({
    queryKey: [...ADVISOR_REPORT_KEY, 'activity', params],
    queryFn: () => getAdvisorActivity(params),
    placeholderData: keepPreviousData,
    staleTime: UN_MINUTO,
    ...dashboardAutoRefresh,
  });
}
