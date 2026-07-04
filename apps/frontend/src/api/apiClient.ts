import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore.js';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]!) : null;
}

export const apiClient = axios.create({
  baseURL: import.meta.env['VITE_API_BASE_URL'] ?? '/api',
  timeout: 10000,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrf = getCookie('csrfToken');
    if (csrf) config.headers['X-CSRF-Token'] = csrf;
  }
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (e: unknown) => {
    if (axios.isAxiosError(e) && e.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(e);
  },
);
