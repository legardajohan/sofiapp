# DSN-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. La rama `feat/DSN-02` la crea `/sdd-implement` (continúa la
> línea de trabajo de UI/diseño iniciada informalmente en DSN-01; seguirá recibiendo más
> componentes de este tipo).

## Implementación

- [x] Copiar `docs/ui-components/svg-logo-component/assets/sofiapp-lg-v1.svg` →
      `apps/frontend/src/assets/sofiapp-lockup.svg`.
- [x] `features/auth/components/SofiAppLogin.css`: portar de `styles.css` solo
      `.logo-wrap/.logo/.logo__art/.logo__sheen(::before)` + hover/active + reduced-motion, todo
      anidado bajo `#sofiapp-login-wrapper`; renombrar `@keyframes sweep` → `sofiaLogin-sweep`;
      exponer `--sofia-login-width` / `--sofia-login-tint`. `.logo__shadow` se eliminó tras
      feedback visual (se leía como manchón flotante junto al formulario); ancho por defecto
      ajustado de `180px` a `220px` para compensar.
- [x] `features/auth/components/SofiAppLogin.tsx`: componente funcional, props `width` /
      `accentColor` / `className`, importa el CSS de arriba y el asset SVG.
- [x] `features/auth/components/SofiAppWelcomeLoader.css`: portar de `loading.css` solo
      `.boot-overlay*` (sin `.login-mock*`), todo bajo `#sofiapp-loader-wrapper`; `.boot-overlay`
      con `position: fixed; inset:0; z-index:9999`; convertir timing de porcentaje-de-loop a
      duraciones fijas (`logoIn`, `singleSweep`, `tagIn` forwards una sola vez; `progressSlide`
      infinite; nueva `sofiaWelcome-fadeOut` con `animation-delay: var(--sofia-welcome-duration)`);
      renombrar `@keyframes` con prefijo `sofiaWelcome-`.
- [x] `features/auth/components/SofiAppWelcomeLoader.tsx`: componente funcional, props `width` /
      `accentColor` / `tagline` / `durationMs` / `onComplete`; `useEffect` con `setTimeout(onComplete,
      durationMs)` limpiado al desmontar; inyecta `--sofia-welcome-duration`.
- [x] `features/auth/LoginView.tsx`: gate raíz según contrato del `plan.md` (detecta transición a
      `authenticated` mientras `location.pathname === '/login'`; monta/desmonta
      `SofiAppWelcomeLoader`).
- [x] `features/auth/LoginPage.tsx`: reemplazar las 2 `<img>` (líneas 66-67) por
      `<SofiAppLogin width="220px" />`; actualizar imports (quitar `sofiappIcon`/`sofiappName`,
      añadir `SofiAppLogin`). No tocar nada más del archivo.
- [x] `features/auth/index.ts`: añadir `export { LoginView } from './LoginView.js';`.
- [x] `router.tsx`: envolver el `element` de la ruta raíz en `<><LoginView /><AuthBootstrap
      /></>`; import de `LoginView`. Sin cambios en las rutas hijas.

## Verificación final

- [x] `pnpm --filter frontend build` en verde (`tsc --noEmit && vite build`, sin errores).
- [x] `pnpm --filter frontend lint` en verde (el gap de `eslint.config.js` de `INF-01` ya no
      aplica; el proyecto tiene config y el lint corre limpio).
- [x] Prueba manual (dev server + Playwright, con mock de red en `/api/auth/login` porque no
      había superadmin sembrado en el entorno — `.env` está protegido por regla `deny` y no se
      tocó): login completo → overlay a pantalla completa visible (~2.2s, capturado en 3 puntos
      del tiempo: entrada del logo, tagline+progreso, y disolución revelando el destino) → el
      form de login (mutation/store/navegación) redirige exactamente igual que antes
      (`rol admin → '/'`); recargar/errores de credenciales inválidas NO disparan el overlay
      (probado con credenciales incorrectas — solo se ve el error genérico existente);
      `prefers-reduced-motion: reduce` deja ambas pantallas en su estado final quieto, sin
      animación, capturado también.
- [x] DevTools/visual: el lockup y el overlay se renderizan con la tipografía, sombras y colores
      esperados — ninguna regla de Preflight (reset de `img`, márgenes, etc.) los afecta.
- [x] Confirmado que `LoginPage.tsx` no cambió en ninguna línea fuera de las 2 imágenes + imports
      (diff mínimo, lógica de mutation/store/navegación intacta y verificada en vivo).

## Definición de "hecho"

El login muestra el lockup animado en vez de las dos imágenes estáticas; tras un login exitoso
se ve la pantalla de bienvenida animada antes del destino final; nada de la lógica ya probada de
`LoginPage.tsx` cambió; `build` y `lint` del frontend en verde. La rama `feat/DSN-02` queda
abierta para seguir recibiendo trabajo de esta línea de componentes UI.
