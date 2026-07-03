import axios from 'axios';
<<<<<<< HEAD
import { useAuthStore } from '../store/useAuthStore.js';

const getCookie = (name: string): string | undefined => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
  return undefined;
};

export const apiClient = axios.create({
  baseURL: import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:4000',
=======
import { useAuthStore } from '../stores/authStore.js';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]!) : null;
}

export const apiClient = axios.create({
  baseURL: import.meta.env['VITE_API_BASE_URL'] ?? '/api',
>>>>>>> develop
  timeout: 10000,
  withCredentials: true,
});

<<<<<<< HEAD
// CSRF double-submit
=======
>>>>>>> develop
apiClient.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrf = getCookie('csrfToken');
    if (csrf) config.headers['X-CSRF-Token'] = csrf;
  }
  return config;
});

<<<<<<< HEAD
// 401 → logout
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
=======
apiClient.interceptors.response.use(
  (r) => r,
  (e: unknown) => {
    if (axios.isAxiosError(e) && e.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(e);
  },
>>>>>>> develop
);
