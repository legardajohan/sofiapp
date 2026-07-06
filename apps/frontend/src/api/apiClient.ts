import axios from 'axios';
import { useAuthStore } from '../stores/authStore.js';

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
    // Solo forzamos logout+redirect si había una sesión activa que expiró a mitad de uso.
    // Un 401 mientras el store está en 'idle'/'loading' es el probe normal de /auth/me al
    // arrancar sin sesión: dispararía logout() -> hard reload -> vuelve a 'idle' -> bucle infinito.
    if (axios.isAxiosError(e) && e.response?.status === 401 && useAuthStore.getState().status === 'authenticated') {
      useAuthStore.getState().logout();
    }
    return Promise.reject(e);
  },
);
