import { useQuery } from '@tanstack/react-query';
import { fetchFlows } from '../api.js';

export function useFlows() {
  return useQuery({ queryKey: ['flows'], queryFn: fetchFlows });
}
