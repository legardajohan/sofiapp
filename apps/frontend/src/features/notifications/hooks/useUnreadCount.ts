import { useQuery } from '@tanstack/react-query';
import { fetchUnreadCount } from '../api.js';

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
  });
}
