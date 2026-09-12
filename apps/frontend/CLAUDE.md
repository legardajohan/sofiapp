# CLAUDE.md — Frontend (apps/frontend)

> Reglas del frontend. SPA React 19 + Vite, alojada en Vercel.

## Skills de diseño — obligatorias (regla del `CLAUDE.md` raíz §7)

Antes de **crear o modificar cualquier componente** de `apps/frontend` hay que invocar estas tres
skills y aplicar lo que dicten. Se invocan *antes* de escribir el código, no como revisión posterior:

| Skill | Qué aporta |
|---|---|
| `emil-design-eng` | Pulido de UI, decisiones de animación y micro-interacción, los detalles invisibles (timing, easing, estados de foco/pending). |
| `impeccable:impeccable` | Auditoría de UX: jerarquía visual, arquitectura de información, carga cognitiva, accesibilidad, estados vacíos/error, copy de interfaz. |
| `frontend-design:frontend-design` | Dirección visual: tipografía, ritmo, decisiones que evitan que la pantalla se lea como un template por defecto. |

Aplica igual a un componente nuevo (`AssignMenu`) que a un retoque de uno existente
(`ConversationList`). Lo que salga de las skills se somete siempre a las reglas de este archivo:
tokens semánticos, UI kit de `src/components/ui/`, light y dark.

**shadcn/ui no es opcional cuando aplica.** Antes de escribir un control a mano (dropdown, select,
diálogo, tooltip, badge, etc.), usar el componente de [shadcn/ui](https://ui.shadcn.com/)
correspondiente: el ya vendorizado en `src/components/ui/`, o instalarlo con la CLI (ver "Cómo
añadir más componentes" abajo) si falta. Un control hecho a mano donde ya existe su equivalente
shadcn es inconsistencia visual, no una decisión de diseño. Todo componente nuevo o modificado
debe quedar terminado en **light y dark** (tokens semánticos, cero `bg-[#...]`) antes de darlo por
cerrado.

## Principios

- React 19 + Vite + **TypeScript `strict`**.
- Estado de UI con **Zustand**; estado de servidor (datos del API) con **TanStack Query**
  (caché, revalidación, estados de carga/error). No mezclar ambos roles.
- **Organización por feature** (igual filosofía que el backend): `src/features/<feature>/`.
- Estilos con Tailwind + shadcn/ui como base de componentes (ver regla arriba). Sin CSS global disperso.

## Componentes reutilizables (UI kit)

- **Base:** [shadcn/ui](https://ui.shadcn.com/) (registry Radix, estilo `new-york`, `baseColor`
  `slate`). Instalado y documentado en `docs/specs/DSN-03-ui-kit-appshell/`.
- **Dónde viven:**
  - `src/components/ui/` — primitivos vendorizados por la CLI de shadcn (`button`, `input`,
    `label`, `textarea`, `checkbox`, `switch`, `select`, `dropdown-menu`, `dialog`, `table`,
    `badge`, `avatar`, `separator`, `tooltip`, `card`, `sonner` (toasts), `skeleton`, `sidebar`,
    `sheet`). Tratarlos como código vendorizado: se editan solo para añadir variantes propias
    (ver `badge.tsx` → variante `success`), no se reestructuran para "arreglar" el patrón
    export-múltiple de shadcn.
  - `src/components/theme/` — `ThemeProvider`/`useTheme` (contexto light/dark/system,
    persistido en `localStorage`) y `ModeToggle` (dropdown para cambiarlo).
  - `src/components/layout/` — el **App Shell**: `AppLayout` (`SidebarProvider` + `AppSidebar` +
    `SidebarInset` con `<Outlet/>`), `AppSidebar` (header con el logo, navegación por grupos),
    `NavUser` (menú de usuario en el footer del sidebar) y `nav-config.ts` (mapa de navegación
    **rol-aware**: cada `NavItem` declara `roles: UserRol[]`; los ítems sin feature implementada
    se marcan `disabled: true` y quedan como esqueleto inerte hasta que el feature exista).
  - `src/lib/utils.ts` — `cn()` (merge de clases Tailwind, usado por todos los componentes).
- **Cómo añadir más componentes:** `pnpm dlx shadcn@3.8.5 add <componente>` desde
  `apps/frontend/`. **Fijar la versión `3.8.5`** (o la que esté vigente en `docs/specs/DSN-03-*`):
  las versiones `4.x` de la CLI asumen Tailwind v4 (colores OKLCH, `@import "tailwindcss"`) y
  **no son compatibles** con este proyecto, que sigue en Tailwind v3.4 con tokens HSL vía
  variables CSS. Tras generar, si el componente trae sus propias variables CSS (como pasó con
  `--sidebar-*`), alinéalas a la paleta de marca en `src/index.css` en vez de dejar los valores
  zinc/slate por defecto de la CLI.
- **Tokens de color:** siguen `docs/specs/INF-03-design-tokens/` — vocabulario semántico (`bg-background`,
  `text-foreground`, `bg-primary`, `bg-muted`, `border-border`, `bg-destructive-subtle`,
  `bg-success`, etc.), **cero utilidades de color arbitrarias** (`bg-[#...]`) en `src/**`. Desde
  DSN-03 los tokens viven como **variables CSS** en `src/index.css` (`:root` = light, `.dark` =
  dark) y `tailwind.config.js` los referencia con `hsl(var(--token))`; ya no son hex estático.
- **Tema light/dark:** `darkMode: 'class'`. `<ThemeProvider>` envuelve la app en `main.tsx` y
  aplica la clase `.dark`/`.light` en `<html>`. Cualquier vista nueva hereda el tema activo
  automáticamente si usa los tokens semánticos.
  - **`/login` sigue el tema (desde DSN-04):** la ruta ya **no** fuerza light; hereda `.dark`/`.light`
    como el resto de la app y expone un toggle sol/luna (`LoginThemeToggle`) que escribe en el mismo
    `useTheme()` persistido. Esto **supersede** el pin `className="light"` de DSN-02/DSN-03 (ver
    `docs/specs/DSN-04-login-dark-mode/`). El patrón de forzar light en un subárbol puntual
    (`className="light"` re-declarando `:root`) sigue existiendo en `index.css` por si otra vista lo
    necesita, pero el login ya no lo usa.
- **App Shell:** toda pantalla autenticada se monta como hija de `AppLayout` (ver `router.tsx`),
  que ya provee sidebar + `SidebarTrigger` + `Toaster`. Una página nueva **no** necesita volver a
  montar layout: solo se agrega como ruta hija y, si aplica, una entrada en `nav-config.ts`.
- **Login y loader (CSS aislado, no UI kit):** `src/features/auth/**` (incluye
  `SofiAppLogin.{tsx,css}` y `SofiAppWelcomeLoader.{tsx,css}`, con CSS aislado por
  `#sofiapp-login-wrapper` / `#sofiapp-loader-wrapper`) y `src/components/Loading.tsx` **no usan el
  UI kit** ni deben migrarse a él. Desde DSN-04 **sí** tienen rama dark: en `.dark` el lockup cambia
  a un relleno con degradado púrpura↔azul enmascarado por la silueta (estático en el login, animado
  en el loader), conservando el barrido de luz. Al tocar estos archivos, mantené el gating por
  `.dark #sofiapp-*-wrapper …` dentro del scope aislado (no uses utilidades `dark:` de Tailwind:
  el selector de ID gana la cascada y las anularía).

## Una sola puerta de salida HTTP

- Todo el tráfico al API pasa por `src/api/apiClient.ts` (axios).
- **El JWT viaja en una cookie `httpOnly`** que el navegador envía solo (`withCredentials: true`).
  El token **nunca** es accesible por JS, por lo que el store **no lo guarda**: solo guarda el
  usuario/`rol` que devuelve `/api/auth/login` o `/api/auth/me`. El **tenant viaja DENTRO del
  token**; el cliente nunca lo envía aparte. (Ver `docs/adr/0002-auth-token-transport.md`.)
- **CSRF (double-submit):** el backend deja una cookie legible `csrfToken`; el `apiClient` la
  reenvía en el header `X-CSRF-Token` en métodos mutadores (POST/PUT/PATCH/DELETE).
- Interceptor de respuesta: `401 → logout()`.

- **Rutas SIN el prefijo `/api`.** `baseURL` ya lo incluye (ver abajo): todo `apiClient.get/post/
  patch/delete(...)` recibe la ruta relativa al recurso, **nunca** empezando en `/api`.
  - ✅ `apiClient.get('/conversations')`, `apiClient.get('/users')`, `apiClient.post('/auth/login')`
  - ❌ `apiClient.get('/api/conversations')` — con `baseURL` resolviendo a `/api` (el caso normal en
    dev sin `.env`), esto pega contra `/api/api/conversations` → `404`. Bug real de HU-OMNI-02:
    `channels/api.ts`, `inbox/api.ts` y `users/api.ts` lo tenían; se corrigió quitando el prefijo.
    Antes de dar por buena una llamada nueva, comparar contra un `api.ts` ya existente (`auth`,
    `admin-plans`, `admin-tenants`, `knowledge-base` son la referencia correcta).

```ts
// El JWT va en cookie httpOnly (no accesible por JS). withCredentials la adjunta en cada request.
// baseURL: sin VITE_API_BASE_URL (dev local sin .env) cae a '/api' — de ahí que las rutas de
// abajo NUNCA repitan ese prefijo.
const apiClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api', timeout: 10000, withCredentials: true });
apiClient.interceptors.request.use((c) => {
  const method = (c.method ?? 'get').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrf = getCookie('csrfToken');                 // cookie legible, NO httpOnly
    if (csrf) c.headers['X-CSRF-Token'] = csrf;
  }
  return c;
});
apiClient.interceptors.response.use(r => r, (e) => {
  // Solo forzar logout+redirect si había sesión autenticada (evita bucle de reload en el probe /auth/me sin sesión).
  if (e.response?.status === 401 && useAuthStore.getState().status === 'authenticated') useAuthStore.getState().logout();
  return Promise.reject(e);
});
```

> La app **móvil** (Fase 4) no usa cookies: se autentica con `Authorization: Bearer <token>`.
> Esa es la única vía donde el token vive fuera de una cookie. Ver `docs/api-contract.md` §2.

## Autorización en UI (RBAC)

- Guardas de ruta y de componente que **ocultan** acciones según `rol` del usuario.
- La UI nunca es la única defensa: el backend siempre re-valida con `authorize([roles])`.
- Rol → vistas:
  - `superadmin`: panel `/admin` (empresas, planes, métricas globales).
  - `admin`: usuarios, conexión WhatsApp, catálogo, bandeja omnicanal, clientes, campañas — todo
    dentro del tenant. El `subrol` interno opcional (Director/Gerente/Coordinador/Secretaria) es
    solo metadata visible en `NavUser`; no cambia qué ve el `admin` (`AUTH-02`).

## Tiempo real

- Cliente Socket.IO autenticado; se suscribe a *rooms* del tenant/asesor.
- Eventos `message:new`, `cliente:updated`, `cliente:estado-changed` actualizan la caché de
  TanStack Query (no recargar a mano).

## Vistas núcleo

- **Bandeja omnicanal:** lista lateral de conversaciones (canal, nombre, preview, tag de
  interés) + hilo central de mensajes por `sender`. Filtrada por tenant y asesor.
- **Leads (`/leads`):** dos vistas de la misma cartera, con un toggle `Tabla | Embudo` persistido
  en la URL (`?vista=embudo`):
  - **Tabla** — filtrable y paginada; es la que sirve para recorrer muchos leads.
  - **Embudo** — tablero Kanban agrupado por etapa, con **drag & drop** entre columnas
    (`@dnd-kit`) y también operable por teclado. Desde HU-PIPE-01; **supersede** la regla anterior
    de esta sección, que prohibía el Kanban (ver `docs/adr/0007-tablero-kanban-pipeline.md`).
  - Cambiar de etapa: `PATCH /api/leads/:id/stage` con `{ estado }`. La etapa es la `key` de un
    catálogo **por tenant** (`GET /api/estados`), no un enum del código.
- **Catálogo:** CRUD de ítems.
- **Campañas:** wizard de 3 pasos (filtros con conteo en vivo → plantilla HSM → confirmar) +
  historial.
- **Panel Superadmin:** CRUD de empresas, activación manual de planes, dashboard global (Recharts).

## Verificación

- `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.
