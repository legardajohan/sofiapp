const API_BASE = import.meta.env['VITE_API_BASE_URL'] as string ?? 'http://localhost:4000';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function csrfToken(): Promise<string> {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  return meta?.content ?? '';
}

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const mutating = method !== 'GET';
  if (mutating) {
    headers['X-CSRF-Token'] = await csrfToken();
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) {
    // logout será inyectado por el store de auth
    window.dispatchEvent(new Event('auth:logout'));
  }

  if (!res.ok) {
    const error = (await res.json().catch(() => ({ message: 'Error desconocido' }))) as {
      message: string;
    };
    throw new Error(error.message);
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
