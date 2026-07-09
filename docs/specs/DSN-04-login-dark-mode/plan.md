# DSN-04 — Plan técnico (CÓMO)

## Archivos a crear / tocar

```
apps/frontend/src/
├── router.tsx                                   # TOCAR: quitar <div className="light"> del /login
├── features/auth/
│   ├── LoginPage.tsx                            # TOCAR: error a nivel de campo + banner animado + montar toggle
│   ├── index.ts                                 # TOCAR: exportar LoginThemeToggle si aplica
│   └── components/
│       ├── LoginThemeToggle.tsx                 # NUEVO: botón sol/luna (useTheme, light↔dark)
│       ├── SofiAppLogin.tsx                     # TOCAR: capa de degradado dark (dark:block) + img light (dark:hidden)
│       ├── SofiAppLogin.css                     # TOCAR: .logo__fill enmascarado (degradado), gated a dark
│       ├── SofiAppWelcomeLoader.tsx             # TOCAR: capa de degradado animado dark
│       └── SofiAppWelcomeLoader.css             # TOCAR: keyframes de degradado púrpura→azul, gated a dark
└── components/layout/NavUser.tsx                # TOCAR: handler de logout async → api.logout() + store.logout()

apps/frontend/CLAUDE.md                          # TOCAR: nota de tema (login ya no fuerza light; ramas dark del logo)
```

> **Intocable en este feature:** `stores/authStore.ts` — `logout()` se mantiene tal cual (limpieza
> local + `window.location.href = '/login'`), porque lo reusa el interceptor 401 del `apiClient`. La
> llamada al backend se hace en `NavUser` para **evitar el ciclo de import**
> `authStore → features/auth/api → apiClient → authStore`.

## Contratos / técnica

### Rama dark del logo (mirror de `SidebarLogo.{tsx,css}`)
Hoy `SofiAppLogin` es `img.logo__art` (colores nativos del SVG) + `.logo__sheen` enmascarado por
`--sofia-lockup-mask`. Se añade una tercera capa gemela a la del sidebar:
- `img.logo__art` → visible solo en light (`dark:hidden` / `dark:opacity-0`).
- `div.logo__fill` (`hidden dark:block`) con
  `background: linear-gradient(90deg, #008aff 0%, #8a4cff 100%)` (los mismos stops azul→púrpura de
  `SidebarLogo.css`, para coherencia de marca) y
  `mask / -webkit-mask: var(--sofia-lockup-mask) center / contain no-repeat`.
- `.logo__sheen` permanece para ambos temas (barrido idéntico).
- Gating dark por la clase `.dark` que `ThemeProvider` pone en `<html>` (Tailwind `dark:` en el TSX,
  o selector `:where(.dark) #sofiapp-login-wrapper .logo__fill` en el CSS aislado).

### Welcome loader dark (degradado animado)
El overlay se monta en la raíz del router (`LoginView`, fuera del pin light), así que hereda
`<html>.dark`. En dark, el lockup usa una capa de degradado enmascarada igual que arriba, pero con
`@keyframes` que **desplaza** el degradado púrpura→azul (animar `background-position` sobre un
gradiente de ancho >100%) mientras se conservan el sweep único (`sofiaWelcome-singleSweep`), la
tagline y la barra de progreso. Light: sin cambios. Reduced motion: estado final quieto, sin loop.

### Toggle de tema en login (`LoginThemeToggle.tsx`)
```tsx
// Botón ghost tamaño icon; Sun/Moon de lucide-react; escribe en el store persistido.
const { theme, setTheme } = useTheme();
const isDark = theme === 'dark'; // 'system' se trata como su valor resuelto para el icono
onClick={() => setTheme(isDark ? 'light' : 'dark')}
// aria-label dinámico ("Cambiar a modo oscuro" / "…claro"); posición absolute top-4 right-4 en el login.
```
La persistencia es automática: `setTheme` de `ThemeProvider` ya escribe `localStorage['sofiapp-theme']`.

### Error a nivel de campo (`LoginPage.tsx`)
- Derivar el estado de error del `errorMsg` existente (o `loginMutation.isError`). En error: aplicar
  `border-destructive` + `aria-invalid` a **ambos** inputs (`email` y `password`) y mantener el
  banner destructivo actual, ahora con entrada animada (`animate-in fade-in slide-in-from-top-1` de
  `tailwindcss-animate`, o un keyframe propio).
- Limpiar el error en `handleChange` (poner `errorMsg` a `null` al escribir cualquier campo), además
  del reset ya existente en `handleSubmit`.
- Mensaje en español desde `extractErrorMessage` (sin cambios en su lógica).

### Logout completo (`NavUser.tsx`)
```ts
import { logout as logoutRequest } from '@/features/auth/api'; // POST /auth/logout
const storeLogout = useAuthStore((s) => s.logout);
async function handleLogout(): Promise<void> {
  try { await logoutRequest(); } catch { /* best-effort: la cookie puede ya estar inválida */ }
  storeLogout(); // limpia el store + window.location.href = '/login'
}
// <DropdownMenuItem onClick={handleLogout}>…</DropdownMenuItem>
```
`apiClient` adjunta la cookie (`withCredentials`) y el header `X-CSRF-Token` (POST) automáticamente.

## Notas

- **Filtro pnpm real:** `@sofiapp/web` (el `frontend` del CLAUDE.md raíz está desactualizado).
- **CSS aislado:** las ramas dark viven dentro del scope de `#sofiapp-login-wrapper` /
  `#sofiapp-loader-wrapper`; el gating dark usa la clase `.dark` de `<html>`.
- **Sin colores arbitrarios en Tailwind** (`bg-[#...]`) en JSX: los stops del degradado viven en el
  CSS aislado de los componentes de marca (excepción ya vigente, igual que `SidebarLogo.css`).
- **Reduced motion:** las animaciones nuevas (degradado del loader, microanimación de error) se
  desactivan bajo `prefers-reduced-motion: reduce`.
- **Regla superseded:** actualizar en `apps/frontend/CLAUDE.md` la "Excepción deliberada" que dice
  que `/login` fuerza `className="light"`, reflejando que ahora hereda el tema y los componentes de
  marca tienen rama dark.

## Verificación

- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde (incluye
  `tsc --noEmit`, `strict`, sin `any`).
- Playwright (en implementación):
  - (a) toggle sol/luna cambia y **persiste** tras reload (leer `localStorage['sofiapp-theme']`);
  - (b) login en **dark** con logo degradado + barrido;
  - (c) login en **light** byte-idéntico a hoy (comparación visual);
  - (d) welcome loader **dark** con degradado animado tras login exitoso;
  - (e) credenciales inválidas → ambos campos con borde destructivo + banner animado;
  - (f) logout dispara `POST /auth/logout` (network) y redirige a `/login`.
