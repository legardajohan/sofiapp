# INF-03 — Plan técnico (CÓMO)

## Archivos a tocar

```
apps/frontend/
├── tailwind.config.js                        # + theme.extend.colors + theme.extend.boxShadow.card
└── src/
    ├── index.css                             # body #faf8ff → @apply bg-background (capa base)
    └── features/
        ├── auth/LoginPage.tsx                # reemplazar todos los [#...] y shadow-[...]
        └── channels/ChannelConfigPage.tsx    # ídem
```

Ningún archivo nuevo: solo se extiende el config y se migran 3 archivos. No se toca backend.

## Contratos

### tailwind.config.js — `theme.extend`

```js
// theme: { extend: { ... } }
colors: {
  background: '#faf8ff',                                      // fondo de página (lavanda)
  foreground: '#191b23',                                      // texto principal (near-black)
  card:        { DEFAULT: '#ffffff', foreground: '#191b23' }, // superficie de tarjeta + su texto
  primary:     { DEFAULT: '#2563eb', hover: '#1d4ed8', foreground: '#ffffff' },
  secondary:   { foreground: '#434655' },                     // texto secundario / tagline
  muted:       { DEFAULT: '#f2f1f9', foreground: '#737686' }, // superficie tenue + placeholder
  border:      '#e1e2ed',                                     // bordes de card / divisores
  input:       '#c3c6d7',                                     // borde de inputs
  ring:        '#2563eb',                                     // focus ring (soporta /20, /40)
  destructive: { DEFAULT: '#dc2626', foreground: '#ffffff', subtle: '#fef2f2' }, // errores (red)
  success:     { DEFAULT: '#16a34a', foreground: '#ffffff', subtle: '#f0fdf4' }, // estados OK (green)
},
boxShadow: {
  card: '0 4px 12px rgba(0,0,0,0.05)',                        // reemplaza shadow-[0_4px_12px_...]
},
```

Notas de los tokens:
- `card.DEFAULT` es blanco; usar `bg-card` para tarjetas y `text-card-foreground` sobre ellas.
- `primary.hover` habilita `hover:bg-primary-hover`. `ring` habilita `focus:ring-ring/20` y `/40`
  (Tailwind aplica el modificador de opacidad sobre colores hex definidos).
- `muted.DEFAULT` (`#f2f1f9`) es un valor nuevo derivado del fondo, disponible para superficies
  tenues futuras; no rompe nada existente.
- `destructive` y `success` (con `subtle`) reemplazan de forma semántica los `red-*` / `green-*` de
  las alertas y badges — ver tabla de mapeo.

### Tabla de mapeo (arbitrario → token)

| Antes (arbitrario / nombrado) | Después (token) |
|---|---|
| `bg-[#faf8ff]` | `bg-background` |
| `text-[#191b23]` | `text-foreground` |
| `text-[#434655]` | `text-secondary-foreground` |
| `text-[#737686]` | `text-muted-foreground` |
| `placeholder-[#737686]` | `placeholder-muted-foreground` |
| `border-[#e1e2ed]` | `border-border` |
| `border-[#c3c6d7]` | `border-input` |
| `bg-[#2563eb]` | `bg-primary` |
| `hover:bg-[#1d4ed8]` | `hover:bg-primary-hover` |
| `focus:border-[#2563eb]` | `focus:border-ring` |
| `focus:ring-[#2563eb]/20` · `/40` | `focus:ring-ring/20` · `focus:ring-ring/40` |
| `text-white` (sobre botón primary) | `text-primary-foreground` |
| `shadow-[0_4px_12px_rgba(0,0,0,0.05)]` | `shadow-card` |
| alertas `bg-red-50` · `border-red-200` · `text-red-700` · `text-red-500` | `bg-destructive-subtle` · `border-destructive/30` · `text-destructive` · `text-destructive` |
| badges `bg-green-50` · `bg-green-500` · `text-green-700` · `text-green-500` · `border-green-200` | `bg-success-subtle` · `bg-success` · `text-success` · `text-success` · `border-success/30` |

Los neutros de Tailwind sin equivalente semántico claro (`bg-gray-100`, `bg-gray-400`,
`text-gray-600`, `border-gray-200` en badges de estado "desconectado", y `text-gray-500` en
`router.tsx`) **no son arbitrarios** y quedan como están.

### index.css — capa base

```css
/* de:  body { background-color: #faf8ff; } */
@layer base {
  body { @apply bg-background; }
}
```

## Notas

- **Solo color** (+ la sombra `card`): no se introducen tokens de tipografía/espaciado.
- El aspecto visual debe quedar **idéntico**: los tokens son los mismos hex, solo con nombre.
- **Dark mode futuro:** el mismo set de nombres puede migrarse a CSS variables
  (`background: 'hsl(var(--background))'` + `:root`/`.dark` en `index.css`) sin renombrar tokens ni
  volver a tocar las pantallas. Se deja como camino, fuera de alcance aquí.

## Verificación

- `pnpm --filter frontend build` — Tailwind compila con los nuevos tokens sin warnings de clases
  desconocidas.
- `pnpm --filter frontend lint` — sin errores.
- Grep de control: sin coincidencias de `bg-\[#`, `text-\[#`, `border-\[#`, `ring-\[#`,
  `placeholder-\[#`, `shadow-\[` en `apps/frontend/src/**`.
