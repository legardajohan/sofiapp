# INF-03 — Tokens de color de diseño en Tailwind (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Fija la paleta de marca como tokens reutilizables para todo el frontend.

**Estado:** implementado

## Objetivo

Definir la **paleta de diseño de SofiApp como tokens semánticos** en `apps/frontend/tailwind.config.js`
(Tailwind v3, `theme.extend.colors`) y migrar el frontend existente para consumirlos, eliminando
los valores de color arbitrarios inline (`bg-[#faf8ff]`, `text-[#191b23]`, `shadow-[...]`, …). A
partir de aquí toda pantalla nueva usa `bg-background`, `text-foreground`, `bg-primary`… en vez de
teclear hexadecimales, garantizando consistencia visual a lo largo del desarrollo.

## Alcance

Incluye:
- Tokens de color en `theme.extend.colors` con vocabulario alineado a **shadcn/ui** (`background`,
  `foreground`, `card`, `primary`, `secondary`, `muted`, `border`, `input`, `ring`, `destructive`,
  `success`), en **hex estático** (light-only).
- Token `boxShadow.card` para el sombreado de tarjetas.
- Migración de los archivos que hoy usan color arbitrario: `index.css`, `LoginPage.tsx`,
  `ChannelConfigPage.tsx`.

Fuera de alcance (otros features):
- Dark mode / theming con CSS variables (`hsl(var(--token))`). Se deja anotado el camino, no se
  implementa.
- Adopción de componentes shadcn/ui.
- Tokens de tipografía, espaciado o radios (solo color y la sombra de tarjeta).
- Cualquier cambio de backend.

## Criterios de aceptación

1. `apps/frontend/tailwind.config.js` declara en `theme.extend.colors` los tokens semánticos
   definidos en `plan.md`, y `theme.extend.boxShadow.card`.
2. La paleta reproduce **exactamente** los hex de facto ya establecidos (origen: mockup de Stitch,
   ver `docs/specs/AUTH-01-login/tasks.md`): `#faf8ff`, `#ffffff`, `#191b23`, `#434655`, `#737686`,
   `#e1e2ed`, `#c3c6d7`, `#2563eb`, `#1d4ed8`.
3. **Cero utilidades de color arbitrarias** en `apps/frontend/src/**` — un grep de
   `bg-\[#`, `text-\[#`, `border-\[#`, `ring-\[#`, `placeholder-\[#`, `shadow-\[` no arroja
   resultados.
4. `LoginPage.tsx`, `ChannelConfigPage.tsx` e `index.css` usan únicamente tokens o clases Tailwind
   nombradas; el resultado visual es idéntico al actual (sin regresiones de aspecto).
5. `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.

## Dependencias

- `INF-01` (scaffolding del frontend, Tailwind v3 configurado) completo.
- Paleta de facto presente en `AUTH-01` / `HT-WA-01` (`LoginPage.tsx`, `ChannelConfigPage.tsx`).

## Notas

- La documentación (`docs/`) no define paleta; la fuente de verdad de los valores es el código
  existente (que a su vez proviene del mockup de Stitch *"Inicio de Sesión - ConversaCRM"*).
- El MCP de Stitch estaba sin autenticar al planear; si en el futuro se re-conecta y la marca
  cambia, basta ajustar los hex en el config sin tocar las pantallas.
- **Implementación (post-cierre):** `pnpm --filter frontend lint` no pudo verificarse — falta
  `eslint.config.js` en `apps/frontend` (ESLint 9 requiere flat config) y esto es preexistente,
  no introducido por este feature (confirmado con `git stash`). Ver `tasks.md` para el detalle.
  Recomendado abrir un feature de tooling aparte para restaurar el lint.
