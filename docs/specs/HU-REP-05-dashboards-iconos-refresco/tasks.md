# HU-REP-05 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden y marca cada casilla al terminar. **Solo frontend.** No toques
> `apps/backend`, las guardas de ruta ni los textos o valores de los KPIs. Antes de escribir
> cualquier componente, invoca `emil-design-eng`, `impeccable:impeccable` y
> `frontend-design:frontend-design` (regla 7 del `CLAUDE.md` raíz).

## 0. Rama
- [x] Crear `feat/HU-REP-05` desde `develop`.

> Nota: `emil-design-eng` e `impeccable:impeccable` no están instaladas en el entorno; se aplicó `frontend-design:frontend-design` y el lenguaje visual existente de las franjas.
> Nota: `KnowledgeBasePage.test.tsx` ya se colgaba en `develop` (desbordamiento de pila); no depende de este cambio y se excluyó al correr la suite.

## Frontend — piezas compartidas
> El patrón de 6 archivos del backend no aplica: no hay types/model/validation/service/controller/
> routes. El orden aquí va de lo compartido a lo particular.

### 1. Formato — `lib/format.ts`
- [x] Añadir `formatHoraCorta(ms: number): string`, con `Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })`.
- [x] `AdminMetricsPage` deja de declarar su `horaCorta` local.

### 2. Refresco — `hooks/use-dashboard-refresh.ts`
- [x] `DASHBOARD_REFRESH_MS = 5 * 60 * 1000`.
- [x] `dashboardAutoRefresh = { refetchInterval: DASHBOARD_REFRESH_MS, refetchIntervalInBackground: false } as const`.
- [x] `useDashboardRefresh(queryKey)` devuelve `{ refresh, isRefreshing }`, con `refetchQueries({ queryKey, type: 'active' })` y `useIsFetching({ queryKey }) > 0`. Tipos de retorno explícitos.

### 3. Celda KPI — `components/charts/KpiCell.tsx`
- [x] `KpiStripCard({ columns, children })`, con `Card` y `grid gap-px overflow-hidden bg-border` más `columns`.
- [x] `KpiCell({ icon, label, value, detail, accent, valueClassName, children })` según el marcado del plan (D2):
  - [x] Icono `size-4`, a la derecha de la etiqueta, con `aria-hidden`.
  - [x] Color `text-muted-foreground`, o `text-primary` si `accent`.
- [x] `KpiStripSkeleton({ count, columns })` con `aria-busy="true"` y un hueco de icono `size-4`.

### 4. Botón — `components/charts/RefreshControl.tsx`
- [x] `Button variant="outline" size="sm"` "Actualizar" con `RefreshCw`, `disabled` y `aria-busy` mientras `isRefreshing`.
- [x] El icono lleva `animate-spin motion-reduce:animate-none` mientras `isRefreshing`.
- [x] "Actualizado a las HH:MM", solo si llega `updatedAt`, dentro de `aria-live="polite"`.

## Frontend — hooks de datos
### 5. Opciones de refresco y prefijos de clave
- [x] `useGlobalMetrics`: exportar `GLOBAL_METRICS_KEY`, usar `[...GLOBAL_METRICS_KEY, params]` y añadir `...dashboardAutoRefresh`.
- [x] `useAdvisorReport`: hacer lo mismo con `ADVISOR_REPORT_KEY`.
- [x] `useHandoffRate`: hacer lo mismo con `HANDOFF_RATE_KEY`.
- [x] `useTopProducts`: hacer lo mismo con `TOP_PRODUCTS_KEY`.
- [x] `usePeakHours`: hacer lo mismo con `PEAK_HOURS_KEY`.
- [x] Comprobar que las `queryKey` completas quedan idénticas a las de antes (los tests que las usen no cambian).

## Frontend — franjas KPI (iconos según la tabla D1)
### 6. `admin-metrics/components/KpiStrip.tsx`
- [x] Iconos: `Building2`, `Users`, `MessageSquare`, `Target`, `Megaphone` y `DollarSign` (acento + `Progress`).
- [x] Usar `KpiStripCard`/`KpiStripSkeleton` con `columns="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"`.
### 7. `reports/components/AdvisorKpiStrip.tsx`
- [x] Iconos: `Headset`, `MessageSquareReply`, `UserCheck` y `DollarSign` (acento + `Progress`).
### 8. `reports/components/HandoffKpiStrip.tsx`
- [x] Iconos: `Percent` (acento + `Progress`, primera celda), `Bot`, `CircleCheck` y `Headset`.
### 9. `reports/components/TopProductsKpiStrip.tsx`
- [x] Iconos: `MessageCircleQuestionMark`, `Trophy` (acento, `text-2xl truncate` y `title`), `Tags` y `CircleDashed`.
- [x] Borrar la `Celda` local.
### 10. `reports/components/PeakHoursKpiStrip.tsx`
- [x] Iconos: `Clock` (acento, primera celda), `Inbox`, `CalendarDays` y `Activity`.
- [x] Borrar la `Celda` local y conservar `first-letter:uppercase` en el detalle.

## Frontend — páginas
### 11. Cabeceras con `RefreshControl`
- [x] `AdminMetricsPage`:
  - [x] `useDashboardRefresh(GLOBAL_METRICS_KEY)` y `RefreshControl` junto a `MetricsFilters`.
  - [x] Quitar "Datos de las HH:MM" del subtítulo.
- [x] `AdvisorReportPage`: `useDashboardRefresh(ADVISOR_REPORT_KEY)` y `RefreshControl` junto a `PeriodFilter`.
- [x] `HandoffRatePage`: lo mismo.
- [x] `TopProductsPage`: lo mismo.
- [x] `PeakHoursPage`: lo mismo.
- [x] En todas, `updatedAt={data ? dataUpdatedAt : undefined}`. El `Alert` con "Reintentar" no se toca.

## Tests
### 12. `hooks/use-dashboard-refresh.test.tsx` (con temporizadores falsos)
- [x] **CA-4:** con un observador montado, avanzar 5 min provoca 1 llamada nueva a `queryFn`; avanzar 4:59 no provoca ninguna.
- [x] **CA-7, reinicio:** en el minuto 3 se llama a `refresh()` y se hace la llamada. En el minuto 5 no hay llamada, y en el 8 sí.
- [x] **CA-6:** con `focusManager.setFocused(false)`, avanzar 5 min no provoca llamadas.
- [x] **CA-10:** se desmonta, se avanzan 10 min y no hay llamadas.
- [x] `isRefreshing` vale `true` durante la carga y `false` al resolverse.
### 13. `components/charts/KpiCell.test.tsx`
- [x] Pinta la etiqueta, el valor, el detalle y el icono (svg con `aria-hidden`).
- [x] Con `accent`, el icono lleva `text-primary`; sin `accent`, `text-muted-foreground`.
- [x] `KpiStripSkeleton` pinta `count` celdas con `aria-busy`.
### 14. `components/charts/RefreshControl.test.tsx`
- [x] El clic llama a `onRefresh`.
- [x] Con `isRefreshing`, el botón está `disabled` y el svg lleva `animate-spin`.
- [x] Muestra "Actualizado a las …" solo con `updatedAt`.
### 15. Páginas (ampliar los 5 `*.test.tsx`)
- [x] El botón "Actualizar" existe. Al pulsarlo, el mock del API recibe una llamada más con los mismos parámetros.
- [x] **CA-5:** durante ese refetch no aparece `aria-busy` y el valor anterior sigue visible.
- [x] **CA-8:** en `AdminMetricsPage`, tras "Actualizar", `getGlobalMetrics` recibe dos llamadas nuevas: la principal y la del top.
- [x] **CA-1:** cada página tiene 4 o 6 svg de icono en la franja (contar `[aria-hidden] svg` dentro de la `Card` KPI, o `data-slot`/`data-testid` si hace falta).
- [x] **CA-3:** las aserciones de contenido existentes pasan sin editarlas.

## Verificación final
- [x] `pnpm --filter @sofiapp/web build`
- [x] `pnpm --filter @sofiapp/web lint` (con `--max-warnings 0`)
- [x] `pnpm --filter @sofiapp/web test`
- [x] **CA-12:** `git diff --stat develop -- apps/backend` vacío y ninguna guarda de ruta tocada.
- [ ] **CA-11:** revisión visual de los 5 dashboards en light y dark: iconos alineados, spin y hora.
  - Las capturas van en `.playwright-mcp/` y se borran al terminar.
  - Antes del commit, `git status` sin `*.png`/`*.jpg` sueltos.
- [x] Sin `any` y con tipos de retorno explícitos en todo lo exportado.
- [x] Resumir los archivos modificados en el cierre de `/sdd-implement`.
- [x] Actualizar `**Estado:** implementado` en `spec.md`.

## Definición de "hecho"
- [ ] CA-1 … CA-12 del `spec.md` verificados (pendiente solo la revisión visual de CA-11).
- [x] Build, lint y tests del frontend en verde, y backend intacto.
- [x] Ninguna duplicación: una sola celda KPI, una sola configuración de refresco y un solo control de actualización para los cinco dashboards.
