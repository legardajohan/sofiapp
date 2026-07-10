# DSN-03 — Plan técnico (CÓMO)

## Archivos a crear / tocar

```
apps/frontend/
├── components.json                         # NUEVO: config shadcn (style, cssVariables:true, alias)
├── package.json                            # TOCAR: deps (clsx, tailwind-merge, cva, lucide-react,
│                                           #        tailwindcss-animate, @radix-ui/*) — con pnpm
├── tsconfig.json                           # TOCAR: paths { "@/*": ["./src/*"] }
├── vite.config.ts                          # TOCAR: resolve.alias { "@": /src } (vite-tsconfig-paths o manual)
├── tailwind.config.js                      # TOCAR: darkMode:'class', colores → hsl(var(--token)),
│                                           #        borderRadius var(--radius), plugin animate + keyframes
└── src/
    ├── index.css                           # TOCAR: :root (light = hex INF-03) + .dark (paleta oscura)
    ├── main.tsx                            # TOCAR: envolver <ThemeProvider> alto en el árbol
    ├── router.tsx                          # TOCAR: rutas autenticadas dentro de <AppLayout>; login fuera y en light
    ├── lib/
    │   └── utils.ts                        # NUEVO: cn()
    ├── components/
    │   ├── ui/                             # NUEVO: primitivos shadcn (CLI): button, input, label,
    │   │                                   #        textarea, checkbox, switch, select, dropdown-menu,
    │   │                                   #        dialog, table, badge, avatar, separator, tooltip,
    │   │                                   #        card, sonner, skeleton, sidebar, sheet
    │   ├── theme/
    │   │   ├── ThemeProvider.tsx           # NUEVO: contexto tema + useTheme()
    │   │   └── ModeToggle.tsx              # NUEVO: dropdown light/dark/system
    │   └── layout/
    │       ├── AppLayout.tsx               # NUEVO: SidebarProvider + AppSidebar + <Outlet/>
    │       ├── AppSidebar.tsx              # NUEVO: header (logo) + content (nav) + footer (NavUser)
    │       ├── NavUser.tsx                 # NUEVO: menú de usuario (avatar/rol/tenant/toggle/logout)
    │       └── nav-config.ts               # NUEVO: items de navegación + rol requerido
    ├── routes/AdminRoutes.tsx              # TOCAR: renderiza bajo AppLayout
    └── features/admin-tenants/
        ├── pages/AdminTenantsPage.tsx      # TOCAR: usa el kit + AppLayout
        └── components/
            ├── TenantTable.tsx             # TOCAR → Table
            ├── TenantForm.tsx              # TOCAR → Dialog + Input + Label + Switch + Button
            └── TenantStatusSwitch.tsx      # TOCAR → Switch

docs/                                       # TOCAR: apps/frontend/CLAUDE.md (sección UI kit)
```

> **Intocables (cero diffs):** `src/features/auth/**` (login + loader) y `src/components/Loading.tsx`.
> El CSS del login está aislado por `#sofiapp-login-wrapper`/`#sofiapp-loader-wrapper` y no depende
> de los tokens globales; conservar el hex light garantiza que no cambie.

## Contratos

### `src/lib/utils.ts`
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]): string { return twMerge(clsx(inputs)); }
```

### `components.json` (shadcn)
```jsonc
{ "style": "new-york", "rsc": false, "tsx": true,
  "tailwind": { "config": "tailwind.config.js", "css": "src/index.css",
                "baseColor": "slate", "cssVariables": true },
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui" } }
```

### `ThemeProvider.tsx`
```ts
type Theme = 'light' | 'dark' | 'system';
interface ThemeProviderState { theme: Theme; setTheme: (t: Theme) => void; }
export function ThemeProvider(props: { children: React.ReactNode; defaultTheme?: Theme; storageKey?: string }): JSX.Element;
export function useTheme(): ThemeProviderState;
```
- Persiste en `localStorage` (`storageKey` def. `sofiapp-theme`), aplica/quita `.dark` en
  `document.documentElement`; `system` resuelve con `prefers-color-scheme`.

### `nav-config.ts`
```ts
import type { LucideIcon } from 'lucide-react';
type Rol = 'superadmin' | 'admin' | 'coordinador' | 'asesor';
export interface NavItem { label: string; to: string; icon: LucideIcon; roles?: Rol[]; disabled?: boolean; }
export interface NavGroup { label: string; items: NavItem[]; }
export const navGroups: NavGroup[];
```
Mapa rol → navegación (de `docs/product.md` §3 / `apps/frontend/CLAUDE.md`):
| Rol | Entradas funcionales | Entradas esqueleto (`disabled`) |
|---|---|---|
| `superadmin` | Empresas (`/admin/tenants`) | Métricas globales |
| `admin` | WhatsApp (`/settings/channels/whatsapp`) | Usuarios, Catálogo |
| `coordinador` | — | Clientes, Campañas |
| `asesor` | — | Bandeja, Mis clientes |
El filtrado por `rol` usa `useAuthStore().user.rol`; el backend re-valida siempre (la UI solo oculta).

### Tokens → variables CSS (`index.css` + `tailwind.config.js`)
`tailwind.config.js`: cada color pasa a `'hsl(var(--<token>))'` (con `<alpha-value>` donde aplique)
y `borderRadius` a `var(--radius)`. En `index.css`, `:root` reproduce el **hex exacto de INF-03**
expresado en canal HSL (verificar round-trip contra el hex; si un canal redondea, se ajusta):

| Token INF-03 | Hex (light) | `:root` HSL |
|---|---|---|
| `--background` | `#faf8ff` | `250 100% 99%` |
| `--foreground` | `#191b23` | `228 16% 12%` |
| `--card` / `--popover` | `#ffffff` | `0 0% 100%` |
| `--card-foreground` / `--popover-foreground` | `#191b23` | `228 16% 12%` |
| `--primary` / `--ring` | `#2563eb` | `221 83% 53%` |
| `--primary-hover` | `#1d4ed8` | `224 76% 48%` |
| `--primary-foreground` | `#ffffff` | `0 0% 100%` |
| `--secondary-foreground` / `--accent-foreground` | `#434655` | `232 12% 30%` |
| `--muted` / `--accent` / `--secondary` | `#f2f1f9` | `248 33% 96%` |
| `--muted-foreground` | `#737686` | `231 8% 49%` |
| `--border` | `#e1e2ed` | `234 21% 91%` |
| `--input` | `#c3c6d7` | `231 20% 80%` |
| `--destructive` | `#dc2626` | `0 72% 51%` |
| `--destructive-foreground` | `#ffffff` | `0 0% 100%` |
| `--destructive-subtle` | `#fef2f2` | `0 86% 97%` |
| `--success` | `#16a34a` | `142 71% 36%` |
| `--success-foreground` | `#ffffff` | `0 0% 100%` |
| `--success-subtle` | `#f0fdf4` | `138 76% 97%` |

Se añaden los tokens que shadcn espera y que INF-03 no tenía: `--radius` (`0.5rem`) y el bloque
`--sidebar-*` (background, foreground, primary, primary-foreground, accent, accent-foreground,
border, ring). El bloque `.dark` define la paleta oscura (base slate) para **todos** los tokens.
La regla INF-03 sigue vigente: **cero utilidades de color arbitrarias** (`bg-[#...]`) en `src/**`.

### App Shell
- `AppLayout`: `<SidebarProvider><AppSidebar/><SidebarInset><header con SidebarTrigger/><Outlet/></SidebarInset></SidebarProvider>`.
- `AppSidebar`: `SidebarHeader` (logo lockup ya existente en `src/assets`), `SidebarContent` mapea
  `navGroups` filtrados por rol (items `disabled` como esqueleto inerte), `SidebarFooter` con `NavUser`.
- `NavUser`: `DropdownMenu` sobre `Avatar` + nombre/rol/tenant; ítems `ModeToggle` y "Cerrar sesión"
  (`useAuthStore().logout()`).

### Toast
Montar `<Toaster/>` (sonner) una vez en `AppLayout`; las mutaciones de `admin-tenants` pueden usar
`toast.success/error` en lugar de mensajes inline.

## Notas

- **Alias `.js`:** el repo importa con extensión explícita (`./router.js`). Los componentes shadcn
  usan imports sin extensión vía alias `@/…`; se configura `@/*` en tsconfig + vite y se respeta el
  estilo `.js` solo en los imports relativos ya existentes.
- **Login en dark:** el login solo se renderiza logueado-fuera y su ruta queda fuera del `AppLayout`;
  para blindarlo se fija light en la rama pública (sin editar los archivos de `auth`).
- La migración de tokens es **puramente aditiva en apariencia light**: los valores light son los de
  INF-03, así que el resto de pantallas ya existentes no cambian en light.

## Verificación

- `pnpm --filter frontend build` (incluye `tsc --noEmit`) y `pnpm --filter frontend lint` en verde.
- Playwright (manual, en implementación): login y loader sin cambios visuales; toggle light/dark;
  sidebar colapsable y rol-aware; CRUD de tenants operativo dentro del layout.

## Addenda de implementación (ver `tasks.md` para detalle completo)

- CLI fijada a `shadcn@3.8.5` (no `@latest`/v4, incompatible con Tailwind v3 de este proyecto).
- `NavUser` no anida `<ModeToggle/>` (dos `DropdownMenu` de Radix independientes no componen bien);
  usa 3 botones de tema inline dentro de su propio menú. `ModeToggle` queda como standalone.
- `NavUser` no muestra el tenant del usuario: `AuthUser` (authStore) no expone ese campo hoy.
