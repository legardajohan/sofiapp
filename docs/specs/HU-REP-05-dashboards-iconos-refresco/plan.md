# HU-REP-05 — Plan técnico (CÓMO)

> Solo frontend. Sin backend, sin endpoints nuevos y sin cambios de guardas.

## Árbol de archivos a crear / modificar

```
apps/frontend/src/
├── components/charts/
│   ├── KpiCell.tsx                    ← CREAR: KpiStripCard, KpiCell, KpiStripSkeleton (D1/D2/D5)
│   ├── KpiCell.test.tsx               ← CREAR
│   ├── RefreshControl.tsx             ← CREAR: botón "Actualizar" + "Actualizado a las HH:MM" (D4)
│   └── RefreshControl.test.tsx        ← CREAR
├── hooks/
│   ├── use-dashboard-refresh.ts       ← CREAR: DASHBOARD_REFRESH_MS, dashboardAutoRefresh, useDashboardRefresh (D3/D4)
│   └── use-dashboard-refresh.test.tsx ← CREAR: intervalo, reinicio tras manual, pausa oculta, limpieza
├── lib/format.ts                      ← AMPLIAR: formatHoraCorta (sale de AdminMetricsPage)
├── features/admin-metrics/
│   ├── hooks/useGlobalMetrics.ts      ← TOCAR: ...dashboardAutoRefresh + exportar GLOBAL_METRICS_KEY
│   ├── components/KpiStrip.tsx        ← TOCAR: usar KpiCell/KpiStripSkeleton + iconos
│   ├── pages/AdminMetricsPage.tsx     ← TOCAR: RefreshControl en cabecera; quitar "Datos de las HH:MM"
│   └── pages/AdminMetricsPage.test.tsx← AMPLIAR: botón Actualizar
└── features/reports/
    ├── hooks/useAdvisorReport.ts      ← TOCAR: ...dashboardAutoRefresh + exportar clave prefijo
    ├── hooks/useHandoffRate.ts        ← TOCAR: ídem
    ├── hooks/useTopProducts.ts        ← TOCAR: ídem
    ├── hooks/usePeakHours.ts          ← TOCAR: ídem
    ├── components/AdvisorKpiStrip.tsx     ← TOCAR: KpiCell + iconos
    ├── components/HandoffKpiStrip.tsx     ← TOCAR: KpiCell + iconos
    ├── components/TopProductsKpiStrip.tsx ← TOCAR: KpiCell + iconos (quitar Celda local)
    ├── components/PeakHoursKpiStrip.tsx   ← TOCAR: KpiCell + iconos (quitar Celda local)
    ├── pages/AdvisorReportPage.tsx    ← TOCAR: RefreshControl en cabecera
    ├── pages/HandoffRatePage.tsx      ← TOCAR: ídem
    ├── pages/TopProductsPage.tsx      ← TOCAR: ídem
    ├── pages/PeakHoursPage.tsx        ← TOCAR: ídem
    └── pages/*.test.tsx (4)           ← AMPLIAR: botón Actualizar presente y funcional
```

> `TopTenantsChart` **no** se toca: usa `useGlobalMetrics`, así que hereda las opciones de refresco
> y comparte prefijo de clave con la query principal (CA-8).

## Contratos

### `components/charts/KpiCell.tsx`

```ts
import type { LucideIcon } from 'lucide-react';

/** Contenedor de la franja: `Card` con `gap-px` sobre `bg-border` (lenguaje actual). */
export function KpiStripCard(props: {
  /** Clases de columnas, p. ej. 'grid-cols-2 xl:grid-cols-4' o '… sm:grid-cols-3 xl:grid-cols-6'. */
  columns: string;
  children: React.ReactNode;
}): React.ReactElement;

export interface KpiCellProps {
  icon: LucideIcon;
  label: string;
  /** Ya formateado por quien llama (formatEntero, formatPorcentaje, nombre de producto…). */
  value: React.ReactNode;
  detail?: React.ReactNode;
  /** Celda con acento: bg-secondary, label font-medium text-primary, icono text-primary. */
  accent?: boolean;
  /** Clases extra para el valor (p. ej. `text-2xl truncate` del producto, `text-muted-foreground` de "Sin datos"). */
  valueClassName?: string;
  /** Contenido entre valor y detalle (la barra `Progress` de Ventas / Tasa de escalamiento). */
  children?: React.ReactNode;
}
export function KpiCell(props: KpiCellProps): React.ReactElement;

/** Esqueleto con hueco de icono size-4 en la fila de la etiqueta. Lleva aria-busy="true". */
export function KpiStripSkeleton(props: { count: number; columns: string }): React.ReactElement;
```

Marcado de la celda (D2):

```tsx
<div className={cn('flex min-w-0 flex-col gap-1 p-5', accent ? 'bg-secondary' : 'bg-card')}>
  <div className="flex items-center justify-between gap-2">
    <span className={cn('text-sm', accent ? 'font-medium text-primary' : 'text-muted-foreground')}>{label}</span>
    <Icon aria-hidden="true" className={cn('size-4 shrink-0', accent ? 'text-primary' : 'text-muted-foreground')} />
  </div>
  <span className={cn('text-3xl font-semibold tabular-nums tracking-tight text-foreground', valueClassName)}>{value}</span>
  {children}
  {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
</div>
```

> Detalles a conservar por franja:
> - `first-letter:uppercase` del detalle de Horas pico.
> - `title={lider.nombre}` del producto: se pasa dentro de `value` como `<span title>`.
> - Los "Sin datos" en `text-muted-foreground`.
>
> Si `truncate` en el detalle corta textos que hoy hacen wrap en Asesores, Escalamiento o Global,
> se añade una prop `detailWrap` y se elige caso por caso en la verificación visual (CA-3).

### `hooks/use-dashboard-refresh.ts`

```ts
import type { QueryKey } from '@tanstack/react-query';

/** Cada cuánto se refrescan solos los dashboards (D3). */
export const DASHBOARD_REFRESH_MS = 5 * 60 * 1000;

/** Opciones a esparcir en el useQuery de cada dashboard. */
export const dashboardAutoRefresh = {
  refetchInterval: DASHBOARD_REFRESH_MS,
  refetchIntervalInBackground: false,
} as const;

export interface DashboardRefresh {
  /** Vuelve a pedir YA todas las queries activas bajo el prefijo. Reinicia el intervalo (D3). */
  refresh: () => Promise<void>;
  /** Hay una carga en curso bajo el prefijo (manual, automática o por filtro). */
  isRefreshing: boolean;
}

export function useDashboardRefresh(queryKey: QueryKey): DashboardRefresh;
// impl: useQueryClient().refetchQueries({ queryKey, type: 'active' }) + useIsFetching({ queryKey }) > 0
```

### Prefijos de clave (exportados desde cada hook)

| Hook | Prefijo exportado | `queryKey` completa (sin cambios) |
|---|---|---|
| `useGlobalMetrics` | `GLOBAL_METRICS_KEY = ['admin','metrics','global']` | `[...GLOBAL_METRICS_KEY, params]` |
| `useAdvisorReport` | `ADVISOR_REPORT_KEY = ['reports','by-advisor']` | `[...ADVISOR_REPORT_KEY, params]` |
| `useHandoffRate` | `HANDOFF_RATE_KEY = ['reports','handoff-rate']` | ídem |
| `useTopProducts` | `TOP_PRODUCTS_KEY = ['reports','top-products']` | ídem |
| `usePeakHours` | `PEAK_HOURS_KEY = ['reports','peak-hours']` | ídem |

Cada hook queda así (ejemplo):

```ts
return useQuery({
  queryKey: [...ADVISOR_REPORT_KEY, params],
  queryFn: () => getAdvisorReport(params),
  placeholderData: keepPreviousData,
  staleTime: UN_MINUTO,
  ...dashboardAutoRefresh,
});
```

### `components/charts/RefreshControl.tsx`

```ts
export function RefreshControl(props: {
  onRefresh: () => void;
  isRefreshing: boolean;
  /** `dataUpdatedAt` de la query principal; 0/undefined → no se muestra la hora. */
  updatedAt: number | undefined;
}): React.ReactElement;
```

- `Button variant="outline" size="sm"`, `disabled={isRefreshing}`, `aria-busy={isRefreshing}`.
- Icono: `<RefreshCw className={cn('size-3.5', isRefreshing && 'animate-spin motion-reduce:animate-none')} aria-hidden />`.
- Texto: "Actualizar".
- A su izquierda, `<span className="text-xs text-muted-foreground tabular-nums">Actualizado a las {formatHoraCorta(updatedAt)}</span>`.
- Se envuelve con `aria-live="polite"` para que los lectores de pantalla anuncien el cambio de hora.

### Cabecera de cada página

```tsx
const { data, isPending, isError, refetch, dataUpdatedAt } = useAdvisorReport(period.rango);
const dash = useDashboardRefresh(ADVISOR_REPORT_KEY);
…
<header className="flex flex-wrap items-end justify-between gap-4">
  <div className="min-w-0">…título y subtítulo sin cambios…</div>
  <div className="flex flex-wrap items-end gap-3">
    <RefreshControl onRefresh={() => void dash.refresh()} isRefreshing={dash.isRefreshing}
                    updatedAt={data ? dataUpdatedAt : undefined} />
    <PeriodFilter … />   {/* o <MetricsFilters …/> en el tablero global */}
  </div>
</header>
```

El "Reintentar" del `Alert` de error se queda como está, para el caso sin datos.

## Notas

- **Ni Zod ni modelos ni índices ni jobs:** no hay backend. El aislamiento multi-tenant no cambia,
  porque los endpoints y parámetros son los mismos y el `tenantId` lo sigue poniendo el token en el
  backend (CA-12).
- **`isFetching` de `TenantMetricsTable`:** ya atenúa la tabla (`opacity-60`) en cualquier refetch.
  Se acepta también en el refresco automático: es sutil, no deja la tabla en blanco y es coherente
  con el spin del botón.
- **Un solo `staleTime`:** se mantiene en 1 min. Con un `refetchInterval` de 5 min, al volver a la
  pestaña con más de 1 min sin ver, `refetchOnWindowFocus` refresca al instante.
- **Pruebas de temporizador:** usar `vi.useFakeTimers({ shouldAdvanceTime: true })`, como en
  `MessageComposer.voz.test.tsx`, y simular la visibilidad con `focusManager.setFocused(false)` de
  `@tanstack/react-query`, que es lo que la librería consulta.
- **Skills de diseño (regla 7):** antes de escribir `KpiCell`/`RefreshControl`, invocar
  `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`, y verificar
  light/dark con Playwright (capturas en `.playwright-mcp/`, que se borran al terminar).

## Verificación

```
pnpm --filter @sofiapp/web build
pnpm --filter @sofiapp/web lint
pnpm --filter @sofiapp/web test
git diff --stat develop -- apps/backend   # debe estar vacío (CA-12)
```

Cobertura de criterios:

| CA | Dónde se cubre |
|---|---|
| CA-1, CA-2 | `KpiCell.tsx`, las 5 franjas · `KpiCell.test.tsx` + aserción de icono por página |
| CA-3 | Tests existentes de las 5 páginas sin cambios de contenido + revisión visual |
| CA-4, CA-6, CA-10 | `dashboardAutoRefresh` · `use-dashboard-refresh.test.tsx` |
| CA-5 | Test: tras refetch, sin `aria-busy` y con el valor anterior visible |
| CA-7, CA-9 | `RefreshControl` + `useDashboardRefresh` · `RefreshControl.test.tsx` + reinicio en hook test |
| CA-8 | `AdminMetricsPage.test.tsx`: dos llamadas a `getGlobalMetrics` tras "Actualizar" |
| CA-11 | Verificación visual light/dark |
| CA-12 | `git diff` + build/lint/test |
