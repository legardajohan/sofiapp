import { useQuery } from '@tanstack/react-query';
import { fetchFlow } from '../api.js';

export function useFlow(id: string | undefined) {
  return useQuery({
    queryKey: ['flow', id],
    queryFn: () => fetchFlow(id as string),
    enabled: Boolean(id),
  });
}
