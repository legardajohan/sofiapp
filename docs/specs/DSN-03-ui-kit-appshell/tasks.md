# DSN-03 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden, en la rama `feat/DSN-03`. Marca cada casilla al terminar. No cierres
> el feature hasta que TODO esté en verde. **Nunca toques** `src/features/auth/**` ni
> `src/components/Loading.tsx`.

## Implementación

### Setup shadcn + tema
- [x] Instalar deps con **pnpm**: `clsx`, `tailwind-merge`, `class-variance-authority`,
      `lucide-react`, `tailwindcss-animate` (+ los `@radix-ui/*` que arrastren los componentes).
- [x] Configurar alias `@/* → ./src/*` en `tsconfig.json` y en `vite.config.ts`.
- [x] Crear `src/lib/utils.ts` con `cn()`.
- [x] `pnpm dlx shadcn@3.8.5 init` (style new-york, `cssVariables: true`, `baseColor: slate`);
      generar/ajustar `components.json`.
      _Nota: `shadcn@latest` (v4.x) asume Tailwind v4 (OKLCH, `@import "tailwindcss"`) y **no es
      compatible** con este proyecto (Tailwind v3.4). Se fijó la CLI a `3.8.5`, la última versión
      legacy compatible con v3. Documentado en `apps/frontend/CLAUDE.md`._
- [x] Migrar tokens a variables CSS: `src/index.css` (`:root` = hex INF-03 exacto en HSL + `.dark`);
      `tailwind.config.js` → `darkMode:'class'`, colores `hsl(var(--token))`, `borderRadius`
      `var(--radius)`, plugin `tailwindcss-animate`. **Verificado** con Playwright que light no
      cambió (pixel-idéntico con y sin `.dark` en un ancestro).
- [x] Añadir tokens que faltan a INF-03: `--radius` y bloque `--sidebar-*` (light + dark).
      _La CLI trajo `--sidebar-*` con paleta zinc por defecto; se realinearon a los tokens de marca
      (mismos valores que `--background`/`--primary`/etc.) en vez de dejar los defaults._

### Kit de primitivos
- [x] `pnpm dlx shadcn@3.8.5 add button input label textarea checkbox switch select dropdown-menu
      dialog table badge avatar separator tooltip card sonner skeleton sidebar` (arrastra `sheet`).
      _`sonner.tsx` generado importaba `next-themes` (Next.js-only); se reescribió para usar
      `useTheme` de nuestro `ThemeProvider` y se quitó `next-themes` de `package.json`. Se agregó
      variante `success` a `badge.tsx` (no viene por defecto)._

### Tema + App Shell
- [x] `src/components/theme/ThemeProvider.tsx` (+ `useTheme`) y `ModeToggle.tsx`.
- [x] Envolver la app con `<ThemeProvider>` en `src/main.tsx` (alto en el árbol).
- [x] `src/components/layout/nav-config.ts` con `navGroups` rol-aware (mapa de `plan.md`).
- [x] `src/components/layout/AppSidebar.tsx` (header logo + content nav filtrada por rol + footer).
- [x] `src/components/layout/NavUser.tsx` (avatar/nombre/rol + tema + logout).
      _Nota: NO se anida `<ModeToggle/>` (su propio `DropdownMenu`) dentro del `DropdownMenu` de
      `NavUser` — dos raíces `DropdownMenu` de Radix independientes no componen bien (el clic en el
      trigger interno cierra el menú externo, verificado con Playwright). Se usan 3 botones de tema
      inline (Claro/Oscuro/Sistema) dentro del mismo menú en su lugar. `ModeToggle` queda como
      componente standalone reutilizable para otros contextos. El dato de `tenant` no se muestra:
      `AuthUser` (authStore) solo expone `sub`/`rol`/`nombre`, sin tenant — fuera de alcance de
      DSN-03 añadir ese campo al store/JWT._
- [x] `src/components/layout/AppLayout.tsx` (SidebarProvider + AppSidebar + SidebarInset + Outlet + Toaster).
- [x] `src/router.tsx`: montar las rutas autenticadas dentro de `AppLayout`; dejar login **fuera**
      del layout y fijar light en la rama pública. `src/routes/AdminRoutes.tsx` bajo `AppLayout`.

### Ejemplo real: CRUD de tenants sobre el kit
- [x] `features/admin-tenants/components/TenantTable.tsx` → `Table` del kit.
- [x] `features/admin-tenants/components/TenantForm.tsx` → `Dialog`+`Input`+`Label`+`Switch`+`Button`.
- [x] `features/admin-tenants/components/TenantStatusSwitch.tsx` → `Switch`.
- [x] `features/admin-tenants/pages/AdminTenantsPage.tsx` → usa el kit (`Dialog` en vez del overlay
      manual). **No se tocó** `admin-tenants` `api.ts`, store ni types (lógica de datos intacta).

### Documentación
- [x] Añadir a `apps/frontend/CLAUDE.md` la sección `## Componentes reutilizables (UI kit)`:
      ubicación (`src/components/ui/`), nombres/vocabulario, cómo añadir más
      (`pnpm dlx shadcn@3.8.5 add <c>`), convención de tokens, y uso de `AppLayout`/`AppSidebar`/tema.

## Tests / Verificación visual (Playwright)

- [x] **Login intacto:** `/login` en light idéntico al actual (verificado con screenshot); el
      loader de bienvenida sin cambios (CSS aislado, no depende de los tokens migrados).
- [x] **Tema:** los botones de tema alternan light ↔ dark; `.dark`/`.light` se aplica en `<html>` y
      persiste en `localStorage` (`sofiapp-theme`) al recargar. Confirmado con `getComputedStyle`
      que `--background` resuelve al valor correcto en cada rama.
- [x] **Sidebar:** colapsa/expande (`SidebarTrigger`); solo muestra las entradas del rol de la
      sesión (probado con superadmin real); "Métricas globales" queda como esqueleto
      deshabilitado.
- [x] **CRUD tenants (superadmin):** login real (Atlas) → `/admin/tenants` renderiza dentro del
      `AppLayout`; tabla, `Switch` de estado y diálogo "Nueva empresa" verificados en light y dark.

## Verificación final

- [x] `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`, `strict`, sin `any`) sin errores.
      _Nota: el filtro documentado en `apps/frontend/CLAUDE.md` (`pnpm --filter frontend`) no
      coincide con el nombre real del paquete (`@sofiapp/web`); preexistente al feature, no se
      corrigió por estar fuera de alcance de DSN-03._
- [x] `pnpm --filter @sofiapp/web lint` en verde.
- [x] **Cero diffs propios** en `src/features/auth/**` y `src/components/Loading.tsx`. `git diff`
      muestra un cambio en `SofiAppWelcomeLoader.tsx` (una línea de copy) ajeno a esta
      implementación — no originado por ninguna edición de este feature.
- [x] Cero utilidades de color arbitrarias (`bg-[#...]`) nuevas en `src/**` (regla INF-03).

## Definición de "hecho"

El frontend tiene un kit de componentes documentado (`src/components/ui/`), un App Shell con Sidebar
rol-aware y menú de usuario, y tema light+dark funcional. El CRUD de empresas ya usa el kit como
ejemplo de referencia, `apps/frontend/CLAUDE.md` documenta el vocabulario común, y el login/loader
quedaron intactos. Los siguientes features (`M01`, `M02`, `M07`, `M08`) se construyen sobre este kit.
