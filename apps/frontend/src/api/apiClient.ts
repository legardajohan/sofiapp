import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore.js';

const getCookie = (name: string): string | undefined => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
  return undefined;
};

export const apiClient = axios.create({
  baseURL: import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:4000',
  timeout: 10000,
  withCredentials: true,
});

// CSRF double-submit
apiClient.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrf = getCookie('csrfToken');
    if (csrf) config.headers['X-CSRF-Token'] = csrf;
  }
  return config;
});

// 401 → logout
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);
