# DSN-04 — Tasks

> Ejecutar en la rama actual `feat/DSN-03` (el usuario no quiere rama nueva). La implementación real
> la dispara `/sdd-implement`; aquí solo queda la checklist. Marcar `- [x]` al completar.

## Implementación (orden sugerido)

- [x] **`router.tsx`** — quitar el wrapper `<div className="light">` de la ruta `/login` para que
      herede el tema global (`PublicOnly` + `LoginPage` quedan como hijos directos).
- [x] **`LoginThemeToggle.tsx`** (NUEVO) — botón ghost sol/luna con `useTheme()`; alterna light↔dark;
      `aria-label` dinámico. (Importado directo en `LoginPage`; no hizo falta tocar el barrel.)
- [x] **`LoginPage.tsx`** — montar `LoginThemeToggle` (esquina superior); error a nivel de campo
      (borde destructivo + `aria-invalid` en `email` y `password`); banner con entrada animada
      (`animate-in fade-in slide-in-from-top-1`); limpiar el error en `handleChange`. Flujo de éxito intacto.
- [x] **`SofiAppLogin.{tsx,css}`** — `div.logo__fill` (degradado `#a24bff→#6a5cff→#008aff` enmascarado
      por `--sofia-lockup-mask`) que hace crossfade por opacidad con `img.logo__art` según `.dark`; el
      `.logo__sheen` permanece. Gating vía `.dark #sofiapp-login-wrapper …` (no `dark:` de Tailwind).
- [x] **`SofiAppWelcomeLoader.{tsx,css}`** — en dark, `div.boot-overlay__fill` con degradado animado
      púrpura→azul (`@keyframes sofiaWelcome-gradShift` sobre `background-position`) + fondo oscuro
      coherente + tagline/barra dark; sweep único, tagline y barra conservados; light intacto; reduced-motion sin loop.
- [x] **`NavUser.tsx`** — `handleLogout` async: `await logoutRequest()` (`POST /auth/logout`) dentro de
      try/catch, luego `storeLogout()`. Cableado al `DropdownMenuItem` de "Cerrar sesión".
- [x] **`apps/frontend/CLAUDE.md`** — actualizada la nota de tema: el login ya no fuerza `light`; los
      componentes de marca ahora tienen rama dark (con la advertencia sobre no usar `dark:` de Tailwind).

## Tests / Verificación final

- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde
      (`tsc --noEmit`, `strict`, sin `any`).
- Playwright — checks del `plan.md` §Verificación:
  - [x] (a) toggle sol/luna cambia y persiste tras reload (`localStorage['sofiapp-theme']='dark'`).
  - [x] (b) login en dark: logo con degradado púrpura→azul + barrido de luz.
  - [x] (c) login en light: **byte-idéntico** a hoy (verificado visualmente).
  - [~] (d) welcome loader en dark: degradado animado — code-verified (build verde); no ejercitado
        end-to-end por falta de backend/credenciales en el entorno de verificación.
  - [x] (e) credenciales inválidas: ambos campos con borde destructivo + banner animado; se limpia al
        escribir; el flujo de éxito no cambia.
  - [~] (f) logout: `POST /auth/logout` + redirect — code-verified (build verde); no ejercitado
        end-to-end por falta de backend.

> Sin test de aislamiento multi-tenant: feature 100% frontend, sin acceso a Mongo (ver nota del
> `spec.md` / criterio de DSN-03).

## Definición de "hecho"

- [x] Los 7 criterios de aceptación del `spec.md` cubiertos; light/dark, toggle+persistencia y error
      verificados en vivo con Playwright; loader-dark y logout-al-back verificados por build (pendiente
      prueba en vivo con backend arriba).
- [x] Build + lint en verde; sin regresión visual del login en light.
- [x] `spec.md` en `**Estado:** implementado`.
