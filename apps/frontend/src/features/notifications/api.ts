import { apiClient } from '../../api/apiClient.js';
import type { NotificationDTO } from './types.js';
import type { Paginated } from '../inbox/types.js';

export async function fetchNotifications(page = 1, limit = 20): Promise<Paginated<NotificationDTO>> {
  const { data } = await apiClient.get<Paginated<NotificationDTO>>('/notifications', {
    params: { page, limit },
  });
  return data;
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<{ count: number }>('/notifications/unread-count');
  return data.count;
}

export async function markNotificationRead(id: string): Promise<NotificationDTO> {
  const { data } = await apiClient.patch<NotificationDTO>(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.patch('/notifications/read-all');
}
