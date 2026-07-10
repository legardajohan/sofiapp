# DSN-03 — UI Kit (shadcn/ui) + App Shell (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Es el vocabulario visual común del frontend: la base sobre la que se construirán
> todas las pantallas.

**Estado:** implementado

## Objetivo

Dotar al frontend de una **biblioteca de componentes reutilizables** (shadcn/ui, registry Radix) y
un **App Shell** (layout autenticado con Sidebar de shadcn, menú de usuario y navegación rol-aware),
con soporte de **tema light + dark**. A partir de aquí, cualquier feature usa el mismo kit y todos
los desarrolladores hablan el mismo idioma de componentes. El CRUD de empresas (`admin-tenants`) se
refactoriza como **ejemplo real** de uso del kit; lo que aún no tiene funcionalidad queda como
**esqueleto** de navegación, a implementarse cuando cada feature llegue.

## Alcance

Incluye:
- Instalación y cableado de **shadcn/ui** con **pnpm**: `components.json`, alias `@/*`,
  `src/lib/utils.ts` (`cn()`), deps (`clsx`, `tailwind-merge`, `class-variance-authority`,
  `lucide-react`, `tailwindcss-animate`, Radix).
- **Kit de primitivos** en `src/components/ui/` (ver criterio 2).
- **Migración de los tokens INF-03 a variables CSS** (`:root` light + `.dark`), `darkMode: 'class'`,
  conservando **exacto** el color light actual. `ThemeProvider` (light/dark/system) + `ModeToggle`.
- **App Shell:** `AppLayout` + `AppSidebar` (header con logo, navegación rol-aware, footer con menú
  de usuario) montando las rutas autenticadas.
- **Refactor de `admin-tenants`** (tabla, formulario, switch de estado, página) sobre el kit, dentro
  del `AppLayout`, **sin alterar** su lógica de datos (TanStack Query + `apiClient`).
- Sección **`## Componentes reutilizables (UI kit)`** en `apps/frontend/CLAUDE.md`.

Fuera de alcance (otros features):
- La funcionalidad de negocio detrás de los enlaces esqueleto (bandeja `M01`, prospectos `M02`,
  campañas `M07`, catálogo `M08`).
- Nuevos endpoints o cambios de backend.
- Polish visual profundo del modo dark más allá de los defaults de shadcn.
- La interfaz de **login** y el **loader** de bienvenida → intocables (ver criterio 6).

## Criterios de aceptación

1. **shadcn cableado:** existen `apps/frontend/components.json`, alias `@/* → src/*` en
   `tsconfig.json` y `vite.config.ts`, y `src/lib/utils.ts` con `cn()`. Las deps se instalaron con
   **pnpm**. `pnpm dlx shadcn@latest add <c>` funciona para añadir más componentes.
2. **Kit de primitivos** en `src/components/ui/` con vocabulario shadcn estándar, al menos:
   `button`, `input`, `label`, `textarea`, `checkbox`, `switch`, `select`, `dropdown-menu`,
   `dialog`, `table`, `badge`, `avatar`, `separator`, `tooltip`, `card`, `sonner`, `skeleton`,
   `sidebar` (arrastra `sheet`).
3. **Tema light + dark:** `darkMode: 'class'` activo; los 12 tokens de INF-03 viven como variables
   CSS en `src/index.css` (`:root` reproduce el hex actual; `.dark` define la paleta oscura) y
   `tailwind.config.js` los referencia con `hsl(var(--token))`. `ThemeProvider` persiste la
   preferencia en `localStorage` y aplica la clase `.dark` en `document.documentElement`;
   `ModeToggle` alterna light/dark/system.
4. **App Shell:** `AppLayout` envuelve las rutas autenticadas con `SidebarProvider` + `Sidebar`:
   header con el logo lockup existente, `SidebarContent` con navegación **rol-aware** (según
   `docs/product.md` §3 y `apps/frontend/CLAUDE.md`), y `SidebarFooter` con menú de usuario (avatar,
   nombre, rol, tenant, `ModeToggle`, logout vía `useAuthStore`). El sidebar colapsa/expande. Las
   entradas sin feature son **esqueleto** (deshabilitadas o inertes); solo enlazan las existentes:
   tenants (`superadmin`) y WhatsApp (`admin`).
5. **CRUD de tenants sobre el kit:** `TenantTable`→`Table`, `TenantForm`→`Dialog`+`Input`+`Label`+
   `Switch`+`Button`, `TenantStatusSwitch`→`Switch`; `AdminTenantsPage` renderiza dentro del
   `AppLayout`. La lógica de datos (`admin-tenants` `api.ts`, store, types) **no cambia**; el CRUD
   sigue operativo (listar, crear, editar, cambiar estado).
6. **Login y loader intactos:** cero diffs en `src/features/auth/**` (incl. `SofiAppLogin.{tsx,css}`,
   `SofiAppWelcomeLoader.{tsx,css}`, `LoginPage.tsx`, `LoginView.tsx`) y en `src/components/Loading.tsx`.
   Su apariencia en light **no cambia** (verificación visual con Playwright); la ruta pública de
   login se mantiene fuera del `AppLayout` y fijada a light.
7. **Documentación:** `apps/frontend/CLAUDE.md` tiene la sección `## Componentes reutilizables (UI
   kit)`: dónde viven los componentes, cómo se nombran, cómo añadir más, la convención de tokens y
   el uso de `AppLayout`/`AppSidebar`/tema.
8. **Verde:** `pnpm --filter frontend build && pnpm --filter frontend lint` sin errores (incluye
   `tsc --noEmit`, TypeScript `strict`, sin `any`).

> **Nota:** este feature es 100% frontend y **no accede a Mongo**, por lo que —a diferencia de los
> features de backend— no lleva criterio de aislamiento multi-tenant. El aislamiento sigue
> garantizado en el backend (INF-02 / HU-SAAS-01), que este UI solo consume vía `apiClient`.

## Dependencias

- `INF-03` (design tokens) — se migran sus tokens a variables CSS conservando los valores light.
- `AUTH-01` (login, `authStore`, sesión) — el menú de usuario y el logout se apoyan en él.
- `HU-SAAS-01` (backend CRUD de empresas, ya implementado) — el ejemplo de uso lo consume.
