# INF-03 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.

## Implementación

- [x] Editar `apps/frontend/tailwind.config.js`: agregar `theme.extend.colors` con los tokens de
      `plan.md` (`background`, `foreground`, `card`, `primary`, `secondary`, `muted`, `border`,
      `input`, `ring`, `destructive`, `success`) y `theme.extend.boxShadow.card`.
- [x] Editar `apps/frontend/src/index.css`: mover el fondo del `body` a
      `@layer base { body { @apply bg-background; } }` (quitar `background-color: #faf8ff`).
- [x] Migrar `apps/frontend/src/features/auth/LoginPage.tsx` según la tabla de mapeo (todos los
      `[#...]`, `shadow-[...]` y el `text-white` del botón primary).
- [x] Migrar `apps/frontend/src/features/channels/ChannelConfigPage.tsx` según la tabla de mapeo
      (incluye alertas `red-*` → `destructive` y badges `green-*` → `success`).

## Tests / Verificación visual

- [x] Grep de control en `apps/frontend/src/**` sin coincidencias:
  - [x] `bg-\[#`, `text-\[#`, `border-\[#`, `ring-\[#`, `placeholder-\[#`, `shadow-\[`.
- [x] Revisión de código: LoginPage y ChannelConfigPage usan los mismos hex, solo con nombre de
      token (fondo, bordes, texto, botón primary, focus ring, alertas/badges) — sin regresión
      visual esperada. No se validó en navegador (ver nota abajo).

## Verificación final

- [x] `pnpm --filter frontend build` sin errores ni warnings de clases desconocidas.
- [ ] `pnpm --filter frontend lint` — **bloqueado por un gap preexistente, no introducido por este
      feature**: no existe `eslint.config.js` (ni `.eslintrc.*`) en `apps/frontend`; ESLint 9
      requiere flat config. Confirmado con `git stash` que el mismo error ocurre sin los cambios
      de INF-03. Fuera de alcance de este spec; requiere un feature propio de tooling.
- [x] Cada criterio de aceptación del `spec.md` (1–4) verificado; el criterio 5 queda parcial
      (build verde, lint bloqueado por el gap de configuración descrito arriba).

## Definición de "hecho"

La paleta de marca vive como tokens semánticos en `tailwind.config.js` y todo el frontend existente
los consume; no queda ningún hex arbitrario en `src/**`. Las pantallas futuras usan `bg-background`,
`text-foreground`, `bg-primary`, `shadow-card`, etc., y un cambio de marca se hace en un solo lugar.
Queda anotado el camino a dark mode (CSS variables) sin renombrar tokens.
