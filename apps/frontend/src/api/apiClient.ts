import axios from 'axios';
import { useAuthStore } from '../stores/authStore.js';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * Base del API. La misma que usa `apiClient`, expuesta aparte para las URLs que **no** pasan por
 * axios: el `src` de un `<img>`, un `<video>` o un `<a href>`.
 *
 * Esas peticiones las hace el navegador en crudo, así que no reciben el `baseURL` del cliente. Sin
 * prefijarlas a mano, el navegador las resuelve contra el origen de la SPA: en desarrollo Vite
 * devuelve el `index.html` (solo proxea `/api` y `/socket.io`) y el recurso sale roto; en
 * producción ni siquiera llegan al API, que vive en otro dominio.
 */
export const API_BASE_URL: string =
  (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? '/api';

/** Antepone la base del API a una ruta relativa al recurso (sin el prefijo `/api`). */
export function apiUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
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
