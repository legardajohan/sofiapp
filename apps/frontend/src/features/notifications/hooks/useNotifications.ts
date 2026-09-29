import { useQuery } from '@tanstack/react-query';
import { fetchNotifications } from '../api.js';

export function useNotifications(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['notifications', 'list', page, limit],
    queryFn: () => fetchNotifications(page, limit),
  });
}
