# DSN-04 — Login en dark, logo con degradado, UX de error y logout real (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Feature 100% frontend: incorpora el login al sistema de tema y completa el flujo
> de sesión (logout) hasta el backend.

**Estado:** implementado

## Objetivo

Hacer que la pantalla de login participe del sistema de tema (dark/light) con persistencia, dotar al
logo de un degradado enmascarado púrpura↔azul en dark (estático en el login, animado en el welcome
loader al autenticar), mejorar el feedback de error de credenciales, y completar el flujo de logout
hasta invalidar la sesión en el servidor.

Contexto: tras DSN-02 (logo animado + welcome loader) y DSN-03 (UI kit + tema + App Shell), el login
quedó **deliberadamente fijado a light** (`<div className="light">` en `router.tsx`) y sus
componentes de marca marcados como "intocables". El `ThemeProvider` (DSN-03) **ya persiste** la
preferencia en `localStorage` (`sofiapp-theme`) y aplica `.dark`/`.light` en `<html>` para toda la
app; y el backend **ya expone** `POST /auth/logout` (`clearAuthCookies`, 204). Este feature conecta
el login a lo que ya existe y añade las ramas dark de los logos.

## Alcance

Incluye:
- Quitar el pin `.light` de `/login` en `router.tsx` para que herede el tema global.
- Botón compacto sol/luna en el login (`LoginThemeToggle`) sobre `useTheme()` persistido.
- Rama **dark** del logo en `SofiAppLogin.{tsx,css}`: capa de degradado enmascarada por la silueta
  del lockup (misma técnica que `SidebarLogo`), conservando el barrido de luz; light byte-idéntico.
- Rama **dark animada** en `SofiAppWelcomeLoader.{tsx,css}`: al mostrarse tras el login, el lockup
  anima el degradado púrpura→azul, con el resto de efectos (sweep único, tagline, barra) intactos;
  light byte-idéntico.
- Mejora de error en `LoginPage.tsx`: estado de error a nivel de campo (bordes destructivos en
  `email`/`password`) + banner con entrada animada; se limpia al escribir.
- Logout de extremo a extremo: `NavUser` llama `POST /auth/logout` (vía `api.logout()`) y luego
  `authStore.logout()` (limpieza + redirect), resiliente ante fallo de red.
- Actualizar `apps/frontend/CLAUDE.md` (nota de tema: el login ya no fuerza light; los componentes
  de marca ahora tienen rama dark).

Fuera de alcance (otros features):
- Backend: **ningún cambio** (el endpoint `/auth/logout` ya existe y funciona).
- Distinción semántica email-vs-password del error: el backend devuelve un único `message` genérico,
  así que se marcan **ambos** campos; no se infiere cuál falló.
- Añadir `react-hook-form`, `zod` en frontend o una librería de animación (`framer-motion`): se usa
  `useState` + `tailwindcss-animate`/keyframes CSS, como el resto del proyecto.
- Cambiar la ilustración de marca, el fondo o el barrido de luz del logo (quedan idénticos).

## Criterios de aceptación

1. Con `sofiapp-theme = dark`, `/login` renderiza en dark (tarjeta, formulario, textos, fondo con
   tokens semánticos); con `light`, idéntico a hoy. El pin `.light` de `router.tsx` ya no existe.
2. El botón sol/luna del login alterna light↔dark, se refleja de inmediato y **persiste**: al
   recargar o volver a entrar, el login abre en el último tema elegido (mismo `localStorage`
   `sofiapp-theme` que usan el resto de la app y el menú de usuario del sidebar).
3. En **dark**, el logo del login muestra el degradado púrpura↔azul enmascarado a la silueta del
   lockup, con el mismo barrido de luz; en **light** el logo es byte-idéntico al actual (colores
   nativos del SVG). Respeta `prefers-reduced-motion`.
4. Tras login exitoso en **dark**, el `SofiAppWelcomeLoader` muestra el lockup con el degradado
   **animado** púrpura→azul + el resto de efectos; en **light** el loader es byte-idéntico al actual.
5. Con credenciales inválidas, ambos inputs toman borde destructivo y aparece el banner con entrada
   animada y mensaje en español; el estado de error se limpia al editar cualquier campo. El flujo de
   éxito (redirect por rol + welcome loader) no cambia.
6. "Cerrar sesión" invoca `POST /auth/logout` (borra cookies httpOnly/CSRF en el server), luego
   limpia el store y redirige a `/login`; si la llamada al back falla, igual limpia local y redirige.
7. `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde (incluye
   `tsc --noEmit`, TypeScript `strict`, sin `any`). Verificación visual con Playwright (light y dark).

> **Nota:** este feature es 100% frontend y **no accede a Mongo**, por lo que —igual que DSN-03— no
> lleva criterio de aislamiento multi-tenant. El aislamiento sigue garantizado en el backend
> (INF-02 / AUTH-01), que este UI solo consume vía `apiClient`. Este feature **supersede a propósito**
> la regla "login intacto / fijado a light" de DSN-02 y del criterio 6 de DSN-03.

## Addenda (refinamiento post-implementación, 2026-07-09)

A pedido del usuario, en **dark** se ajustó:
1. **Inputs oscuros con profundidad:** en dark los campos toman el color del fondo
   (`dark:bg-background`, casi negro, más oscuro que la tarjeta) con una sombra interior sutil
   (`dark:shadow-[inset…]`). Además, `LoginPage.css` neutraliza el fondo blanco/amarillo del
   **autocompletado** del navegador (`:-webkit-autofill`) forzándolo a los tokens del tema
   (`hsl(var(--card))` en light, `hsl(var(--background))` en dark) — era la causa del "input blanco"
   que solo aparecía con credenciales guardadas. Light sin cambios (superficie blanca de la tarjeta).
2. **Degradado arcoíris animado + aura aditiva:** el relleno del lockup es un **arcoíris saturado que
   viaja a lo ancho** del SVG (ciclo suave ~8s), *además* del barrido de luz; y una **aura** que
   EMITE luz (copia enmascarada del mismo arcoíris, difuminada y en `mix-blend-mode: screen` → halo
   aditivo acorde al color que pasa, sin silueta duplicada) rodea el contorno. Estilo compartido
   `components/rainbow-fill.css` (clase `.sofia-rainbow-fill`) en **ambos** lockups (`SofiAppLogin` y
   `SofiAppWelcomeLoader`); cada componente aporta su capa `.*__aura` (mask + blur + screen).
   Respeta `prefers-reduced-motion`. Reemplaza el púrpura→azul del loader por el arcoíris.

## Dependencias

- `DSN-02` (login-welcome-visuals) — `SofiAppLogin` y `SofiAppWelcomeLoader` con su CSS aislado.
- `DSN-03` (ui-kit-appshell) — `ThemeProvider`/`useTheme` persistido, `ModeToggle`, App Shell,
  `NavUser`, tokens dark en `index.css`.
- `AUTH-01` (login) — `authStore` (`logout`), `api.logout()` y el endpoint backend `/auth/logout`.
