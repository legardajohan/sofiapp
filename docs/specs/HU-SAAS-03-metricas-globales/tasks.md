# HU-SAAS-03 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature
> hasta que TODO esté en verde. Patrón de 6 archivos (sin model: la feature solo lee) y
> excepción superadmin documentada en `docs/multi-tenancy.md` §5.3.

## Backend — Feature `admin-metrics/` (agregaciones GLOBALES, solo superadmin)

### 1. Types — `features/admin-metrics/admin-metrics.types.ts`
- [x] `TenantEstado`, `MetricsSortField`, `ITenantMetricsRow`, `IGlobalMetricsConsolidado`,
      `IMonthlyPoint`, `IGlobalMetricsResponse`.
- [x] Constante `KEY_ESTADO_VENTA = 'pagado'` (o reutilizar la de `estado.types.ts` si existe).
- [x] Reutilizar `EstadoCampana`/`ESTADOS_CAMPANA` de `campaign.types.ts`. Cero `any`.

### 2. Model
- [x] **No aplica** — se leen `Tenant`, `Plan`, `User`, `Cliente`, `Message`, `Lead`, `Campaign`.
      Confirmar que no hace falta índice nuevo (ver `plan.md` § Índices).

### 3. Validation — `features/admin-metrics/admin-metrics.validation.ts`
- [x] `globalMetricsQuerySchema` con `desde`, `hasta` (refine `hasta >= desde`), `page`, `limit` (1–100),
      `sort` (enum), `order`, `search` (≤80), `estado` (enum).
- [x] `GlobalMetricsQueryInput = z.infer<…>` (DTO derivado de Zod, no a mano).

### 4. Service — `features/admin-metrics/admin-metrics.service.ts`
- [x] Helpers puros: `buildCreatedAtMatch(q)`, `normalizeHasta`, `ultimosPeriodos(fin, 6)`,
      `escapeRegex`, `ratio(ventas, leads)`.
- [x] Agregaciones en `Promise.all` (tenants, plans, usuarios, conversaciones, mensajes, leads+ventas,
      campañas, serie mensual), cada una con el comentario de **excepción superadmin §5.3** y
      proyectando **solo conteos**.
- [x] Merge sobre tenants existentes (descarta `tenantId` huérfanos; superadmin excluido por `$ne: null`).
- [x] Consolidado desde todas las filas (antes de filtrar/paginar).
- [x] Desglose: filtro `estado`/`search` → orden `sort/order` + desempate `nombre` → `slice`.
- [x] Serie de 6 meses con ceros.
- [x] `getGlobalMetrics(q, now?)` con tipo de retorno explícito `Promise<IGlobalMetricsResponse>`.

### 5. Controller — `features/admin-metrics/admin-metrics.controller.ts`
- [x] `getGlobalMetricsController`: lee query validado → `getGlobalMetrics` → `res.json`. Sin
      `try/catch`, sin Mongoose, sin lógica.

### 6. Routes — `features/admin-metrics/admin-metrics.routes.ts`
- [x] `GET /global` → `authenticateJWT, authorize(['superadmin']), validate(globalMetricsQuerySchema),
      asyncHandler(getGlobalMetricsController)`. **SIN** `requireTenant`.

### 7. Montaje — `app.ts`
- [x] `app.use('/api/admin/metrics', adminMetricsRoutes)` en el bloque de rutas Superadmin.

## Tests (backend)

### 8. `admin-metrics.routes.test.ts` (patrón de `plan/plan.routes.test.ts`)
- [x] Sin JWT → 401.
- [x] Rol `admin` → 403.
- [x] Superadmin → 200 con claves `generadoAt`, `rango`, `consolidado`, `serieMensual`, `porEmpresa`.
- [x] 400: `hasta < desde`, fecha inválida, `limit=101`, `sort=foo`.

### 9. `admin-metrics.service.test.ts`
- [x] Consolidado = Σ filas (usuarios, conversaciones, mensajes, leads, ventas, campañas); `empresas.total`.
- [x] Ventas = leads `estado: 'pagado'`; `tasaConversion` correcta y 0 sin leads.
- [x] Superadmin (`tenantId: null`) no suma usuarios; doc con `tenantId` huérfano no genera fila.
- [x] `desde/hasta` filtra conversaciones/mensajes/leads/campañas; empresas/usuarios no cambian.
- [x] `planes`: agrupa por plan e incluye "Sin plan".
- [x] `serieMensual`: 6 periodos consecutivos, ceros donde no hay datos.
- [x] Desglose: orden por `ventas desc`, `nombre asc`, paginación (`page=2, limit=1`), `search`, `estado`
      — el consolidado no cambia con filtros.

### 10. `admin-metrics.isolation.test.ts` (invariante — `docs/multi-tenancy.md` §8)
- [x] Dos tenants A y B con volúmenes **distintos** de usuarios/clientes/mensajes/leads/ventas/campañas:
      la fila de A refleja exactamente los de A y la de B los de B.
- [x] La respuesta no contiene PII: serializar el body y verificar que no aparecen teléfonos,
      nombres de contacto ni textos de mensajes sembrados.
- [x] Admin con token de A → 403 (no ve ni su propia fila por esta ruta).
- [x] Las suites de aislamiento existentes (`*.isolation.test.ts`) siguen en verde.

## Docs
- [x] `docs/api-contract.md`: registrar `GET /api/admin/metrics/global`.
- [x] `docs/multi-tenancy.md` §5.3: referenciar `admin-metrics.service.ts` (agregaciones globales, solo conteos).

## Frontend — `features/admin-metrics/`

> Antes de escribir cualquier componente: invocar `emil-design-eng`, `impeccable:impeccable`,
> `frontend-design:frontend-design` y `dataviz`, y aplicar sus criterios (CLAUDE.md regla 7).

### 11. Dependencias
- [x] `pnpm --filter @sofiapp/web add recharts`.
- [x] `pnpm dlx shadcn@latest add chart` → `src/components/ui/chart.tsx` (verificar que usa los tokens `--chart-*`).

### 12. Datos
- [x] `types/{domain,api,index}.ts` (espejo del contrato).
- [x] `src/api/admin-metrics.ts` → `getGlobalMetrics(params)` vía `apiClient`.
- [x] `hooks/useMetricsFilters.ts` (estado en `useSearchParams`, `search` con `use-debounced-value`).
- [x] `hooks/useGlobalMetrics.ts` (`useQuery`, `keepPreviousData`, `staleTime 60s`).

### 13. Componentes
- [x] `MetricsFilters` (presets Histórico / Últimos 30 días / Mes actual / Personalizado).
- [x] `KpiCards` (6 tarjetas, Skeleton en carga).
- [x] `PlanDistributionChart` (donut) · `TenantStatusChart` (barras).
- [x] `MonthlyTrendChart` (líneas: conversaciones, leads, ventas).
- [x] `TopTenantsChart` (barras horizontales top 10, `Tabs` Leads/Ventas).
- [x] `TenantMetricsTable` (orden por columna, búsqueda, filtro estado, paginación).
- [x] `AdminMetricsPage` (composición + estados loading/vacío/error con reintento).
- [x] Revisión light **y** dark de cada componente.

### 14. Ruteo y navegación
- [x] `routes/AdminRoutes.tsx`: `<Route path="metrics" element={<AdminMetricsPage />} />`.
- [x] `components/layout/nav-config.ts`: quitar `disabled` de "Métricas globales".

### 15. Test frontend
- [x] `AdminMetricsPage.test.tsx`: con el hook/API mockeado renderiza KPIs y filas; estado de error muestra reintentar.

## Verificación final
- [x] `pnpm --filter @sofiapp/api typecheck` (backend) → `tsc --noEmit` en verde.
- [x] `pnpm --filter @sofiapp/api test` (backend) → routes, service y **isolation** en verde.
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` (frontend) en verde.
- [ ] Verificación visual: superadmin en `/admin/metrics` (light y dark); admin redirigido. Capturas
      solo en `.playwright-mcp/` y **borradas** al terminar; `git status` sin `*.png` sueltos.
      **Pendiente:** el `.env` local no arranca (`MEDIA_URL_SECRET` requerida desde HU-OMNI-06, ajena a
      esta historia). El guard de rol está cubierto por `AdminRoutes` (sin cambios) y los tests.
- [x] Checklist PR de `docs/multi-tenancy.md` §9:
  - [x] Ninguna query tenant nueva fuera de `*Scoped` (las directas son solo las de `admin-metrics.service.ts`, excepción §5.3 documentada).
  - [x] Ruta cross-tenant restringida con `authorize(['superadmin'])` y sin `requireTenant`.
  - [x] Ningún `tenantId` leído de body/params/query.
  - [x] Test de aislamiento presente y en verde.

## Notas de implementación (desvíos respecto del plan)

- Fixtures de test en `admin-metrics.fixtures.ts` (junto a los tests: el `tsconfig` compila `src/` y no
  admite importar de `tests/`). Insertan vía `Model.collection` para fijar `createdAt`.
- `recharts@^3.10.1` (la 2.x está deprecada). La CLI de shadcn genera `chart.tsx` para v2; se adaptaron
  sus tipos a v3 (`TooltipContentProps`, `LegendPayload`) con un comentario en el archivo.
- Tokens `--chart-1..5` reemplazados por una paleta categórica validada (CVD/normal-vision) en light y
  dark; no los usaba ningún componente.
- `KpiCards` se implementó como `KpiStrip` (una franja con divisores, no seis tarjetas); se añadieron
  `ChartCard` (marco común) y `lib/format.ts`. La tendencia separa Conversaciones de Leads y ventas
  en pestañas (evita doble eje).
- `AdminMetricsPage` se carga con `lazy()` en `AdminRoutes`: recharts no entra en el chunk de
  Empresas/Planes.
- Las skills `emil-design-eng` e `impeccable:impeccable` no estaban instaladas en el entorno; se
  aplicaron `frontend-design` y `dataviz`.

## Definición de "hecho"
- Todos los criterios de aceptación de `spec.md` (1–10) verificados.
- Backend typecheck + tests (incluido aislamiento) y frontend build + lint en verde.
- Docs (`api-contract.md`, `multi-tenancy.md`) actualizados.
- `spec.md` → `**Estado:** implementado` (lo actualiza `/sdd-implement`).
