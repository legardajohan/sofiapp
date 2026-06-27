# CLAUDE.md — Frontend (apps/frontend)

> Reglas del frontend. SPA React 19 + Vite, alojada en Vercel.

## Principios

- React 19 + Vite + **TypeScript `strict`**.
- Estado de UI con **Zustand**; estado de servidor (datos del API) con **TanStack Query**
  (caché, revalidación, estados de carga/error). No mezclar ambos roles.
- **Organización por feature** (igual filosofía que el backend): `src/features/<feature>/`.
- Estilos con Tailwind (+ shadcn/ui opcional). Sin CSS global disperso.

## Una sola puerta de salida HTTP

- Todo el tráfico al API pasa por `src/api/apiClient.ts` (axios).
- **El JWT viaja en una cookie `httpOnly`** que el navegador envía solo (`withCredentials: true`).
  El token **nunca** es accesible por JS, por lo que el store **no lo guarda**: solo guarda el
  usuario/`rol` que devuelve `/api/auth/login` o `/api/auth/me`. El **tenant viaja DENTRO del
  token**; el cliente nunca lo envía aparte. (Ver `docs/adr/0002-auth-token-transport.md`.)
- **CSRF (double-submit):** el backend deja una cookie legible `csrfToken`; el `apiClient` la
  reenvía en el header `X-CSRF-Token` en métodos mutadores (POST/PUT/PATCH/DELETE).
- Interceptor de respuesta: `401 → logout()`.

```ts
// El JWT va en cookie httpOnly (no accesible por JS). withCredentials la adjunta en cada request.
const apiClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL, timeout: 10000, withCredentials: true });
apiClient.interceptors.request.use((c) => {
  const method = (c.method ?? 'get').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrf = getCookie('csrfToken');                 // cookie legible, NO httpOnly
    if (csrf) c.headers['X-CSRF-Token'] = csrf;
  }
  return c;
});
apiClient.interceptors.response.use(r => r, (e) => { if (e.response?.status === 401) useAuthStore.getState().logout(); return Promise.reject(e); });
```

> La app **móvil** (Fase 4) no usa cookies: se autentica con `Authorization: Bearer <token>`.
> Esa es la única vía donde el token vive fuera de una cookie. Ver `docs/api-contract.md` §2.

## Autorización en UI (RBAC)

- Guardas de ruta y de componente que **ocultan** acciones según `rol` del usuario.
- La UI nunca es la única defensa: el backend siempre re-valida con `authorize([roles])`.
- Rol → vistas:
  - `superadmin`: panel `/admin` (empresas, planes, métricas globales).
  - `admin`: usuarios, conexión WhatsApp, catálogo, todo dentro del tenant.
  - `coordinador`: todos los clientes, reasignación, campañas.
  - `asesor`: bandeja omnicanal, sus clientes, cambio de estado.

## Tiempo real

- Cliente Socket.IO autenticado; se suscribe a *rooms* del tenant/asesor.
- Eventos `message:new`, `cliente:updated`, `cliente:estado-changed` actualizan la caché de
  TanStack Query (no recargar a mano).

## Vistas núcleo

- **Bandeja omnicanal:** lista lateral de conversaciones (canal, nombre, preview, tag de
  interés) + hilo central de mensajes por `sender`. Filtrada por tenant y asesor.
- **Prospectos por estado:** lista/tabla filtrable por `estadoComercial` (NO tablero Kanban, NO
  drag&drop). Cambiar estado vía `PATCH /api/clientes/:id/estado`.
- **Catálogo:** CRUD de ítems.
- **Campañas:** wizard de 3 pasos (filtros con conteo en vivo → plantilla HSM → confirmar) +
  historial.
- **Panel Superadmin:** CRUD de empresas, activación manual de planes, dashboard global (Recharts).

## Verificación

- `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.
