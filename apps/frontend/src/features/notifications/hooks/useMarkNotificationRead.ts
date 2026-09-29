import { useMutation, useQueryClient } from '@tanstack/react-query';
import { markAllNotificationsRead, markNotificationRead } from '../api.js';

function useInvalidateNotifications() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
    void qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
  };
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: invalidate,
  });
}
