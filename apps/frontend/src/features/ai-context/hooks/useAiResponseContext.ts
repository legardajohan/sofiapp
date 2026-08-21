import { useQuery } from '@tanstack/react-query';
import { fetchAiResponseContext } from '../api.js';

export function useAiResponseContext(id: string | null) {
  return useQuery({
    queryKey: ['ai-response-context', id],
    queryFn: () => fetchAiResponseContext(id as string),
    enabled: !!id,
  });
}
