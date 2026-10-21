import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchAiResponses } from '../api.js';
import type { RangoInstantes } from '../lib/date-range.js';
import type { AiUsageMethod } from '../types.js';

export function useAiResponses(page: number, method?: AiUsageMethod, rango: RangoInstantes = {}) {
  return useQuery({
    queryKey: ['ai-responses', page, method, rango.desde ?? null, rango.hasta ?? null],
    queryFn: () => fetchAiResponses({ page, method, ...rango }),
    placeholderData: keepPreviousData,
  });
}
