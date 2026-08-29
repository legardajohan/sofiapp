import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchAiResponses } from '../api.js';
import type { AiUsageMethod } from '../types.js';

export function useAiResponses(page: number, method?: AiUsageMethod) {
  return useQuery({
    queryKey: ['ai-responses', page, method],
    queryFn: () => fetchAiResponses({ page, method }),
    placeholderData: keepPreviousData,
  });
}
