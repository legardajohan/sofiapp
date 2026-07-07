# DSN-02 — Logo animado + Welcome overlay en el login (spec)

> **Spec-Driven Development.** QUÉ y por qué. El CÓMO va en `plan.md`; la ejecución en
> `tasks.md`.

**Estado:** implementado

## Objetivo

Integrar dos piezas de UI puro HTML/CSS (aportadas en `docs/ui-components/svg-logo-component/`)
al flujo de login de SofiApp, sin tocar la lógica ya probada de `LoginPage.tsx`:

1. Un lockup de logo animado (`SofiAppLogin`) que reemplaza las dos imágenes estáticas
   (ícono + nombre) usadas hoy en la columna de marca del login.
2. Una pantalla de bienvenida animada (`SofiAppWelcomeLoader`) que se muestra brevemente
   después de una autenticación exitosa, antes de llegar al destino final.

Ambos componentes preservan su CSS puro al 100% (sin traducir a Tailwind), aislado mediante
selectores de ID de alta especificidad, y parametrizado vía CSS custom properties.

## Alcance

Incluye:

- Componente `SofiAppLogin` + su CSS aislado (origen: `index.html` + `styles.css`, solo la
  porción `.logo-wrap`/`.logo`/`.logo__art`/`.logo__sheen`/`.logo__shadow`).
- Componente `SofiAppWelcomeLoader` + su CSS aislado (origen: `loading.html` + `loading.css`,
  solo la porción `.boot-overlay*`; se excluye el `.login-mock` de la demo).
- Componente `LoginView`, montado en la raíz del router (hermano de `AuthBootstrap`), que
  detecta la transición a `authenticated` mientras la ruta activa es `/login` y muestra
  `SofiAppWelcomeLoader` a pantalla completa por una duración configurable antes de
  desmontarse.
- Reemplazo puntual de las 2 `<img>` (líneas 66-67) en `LoginPage.tsx` por `<SofiAppLogin />`.
- Copia del asset `assets/sofiapp-lg-v1.svg` a `apps/frontend/src/assets/sofiapp-lockup.svg`.

Fuera de alcance:

- Cualquier cambio a `loginMutation`, `useAuthStore`, `useNavigate` o al destino de
  redirección por rol dentro de `LoginPage.tsx` — se mantienen intactos.
- Construir un formulario de login nuevo en CSS puro (no existe markup fuente para eso).
- Backend, endpoints, `tenantId` — este feature es 100% frontend/visual.
- Eliminar `sofiapp-v1.svg` / `sofiapp-name.svg` (quedan sin uso en este archivo, pero no se
  investiga si se usan en otro lado).

## Criterios de aceptación

1. `SofiAppLogin` renderiza el lockup animado (barrido de luz ambiente, sombra de contacto) y
   acepta props opcionales `width`, `accentColor` (formato `"R, G, B"`) y `className`;
   sin props, usa los valores por defecto del diseño original.
2. Todas las reglas de `SofiAppLogin.css` están anidadas bajo `#sofiapp-login-wrapper` y
   prevalecen visualmente sobre Preflight de Tailwind y `body{...}` de `index.css` (verificable
   en DevTools: ninguna regla de Preflight gana la cascada dentro del wrapper).
3. `LoginPage.tsx` solo cambia en las líneas de las 2 imágenes (66-67) y sus imports; el resto
   del archivo (mutation, store, navegación, formulario, spinner de carga) permanece
   byte-idéntico.
4. `SofiAppWelcomeLoader` renderiza el overlay de bienvenida a pantalla completa (logo con
   entrada, barrido único, tagline, barra de progreso indeterminada), acepta props opcionales
   `width`, `accentColor`, `tagline`, `durationMs` y `onComplete`, y respeta
   `prefers-reduced-motion: reduce` (estado final quieto, sin loops).
5. Tras un login exitoso desde `/login`, se ve el `SofiAppWelcomeLoader` a pantalla completa
   por ~`durationMs` antes de que quede visible el destino post-login (`/admin` o `/`); un
   refresco de página con sesión ya activa (bootstrap de `/me`) **no** dispara el overlay.
6. Ningún archivo de `apps/backend` se modifica. `pnpm --filter frontend build` en verde.

## Dependencias

- `AUTH-01` (login funcional, `authStore`, `router.tsx`, `PublicOnly`/`AuthBootstrap`) completo.
- Assets fuente en `docs/ui-components/svg-logo-component/` (index.html, styles.css,
  loading.html, loading.css, assets/sofiapp-lg-v1.svg).
