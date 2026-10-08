# HU-SAAS-03 — Plan técnico (CÓMO)

## Árbol de archivos a crear / modificar

### Backend

```
apps/backend/src/
├── features/admin-metrics/                     ← CREAR (agregaciones GLOBALES; excepción superadmin §5.3)
│   ├── admin-metrics.types.ts                  # DTOs de query y respuesta
│   ├── admin-metrics.validation.ts             # globalMetricsQuerySchema (Zod)
│   ├── admin-metrics.service.ts                # getGlobalMetrics + agregaciones por colección
│   ├── admin-metrics.controller.ts             # getGlobalMetricsController (delgado)
│   ├── admin-metrics.routes.ts                 # GET /global
│   ├── admin-metrics.routes.test.ts            # 401 / 403 / 400 / 200
│   ├── admin-metrics.service.test.ts           # reglas de conteo, rango, serie, orden/paginación
│   └── admin-metrics.isolation.test.ts         # invariante: fila de A = solo datos de A, cero PII
└── app.ts                                      ← AMPLIAR: app.use('/api/admin/metrics', adminMetricsRoutes)
```

> **Sin `*.model.ts`.** El patrón de 6 archivos (`apps/backend/CLAUDE.md`) se aplica menos el
> modelo: la feature no persiste nada, solo **lee** modelos existentes (`Tenant`, `Plan`, `User`,
> `Cliente`, `Message`, `Lead`, `Campaign`). Crear una colección de métricas está fuera de alcance.

### Frontend

```
apps/frontend/
├── package.json                                ← AMPLIAR: dependencia `recharts`
└── src/
    ├── components/ui/chart.tsx                 ← CREAR vía CLI shadcn (`chart`, envuelve recharts)
    ├── api/admin-metrics.ts                    ← CREAR: getGlobalMetrics(params) vía apiClient
    ├── features/admin-metrics/                 ← CREAR
    │   ├── types/{domain.ts, api.ts, index.ts}
    │   ├── hooks/useGlobalMetrics.ts           # useQuery
    │   ├── hooks/useMetricsFilters.ts          # lee/escribe filtros en la URL (useSearchParams)
    │   ├── components/
    │   │   ├── MetricsFilters.tsx              # presets de rango + fechas personalizadas
    │   │   ├── KpiCards.tsx                    # 6 tarjetas
    │   │   ├── PlanDistributionChart.tsx       # donut
    │   │   ├── TenantStatusChart.tsx           # barras
    │   │   ├── MonthlyTrendChart.tsx           # líneas
    │   │   ├── TopTenantsChart.tsx             # barras horizontales + Tabs Leads/Ventas
    │   │   └── TenantMetricsTable.tsx          # tabla ordenable + búsqueda + paginación
    │   └── pages/
    │       ├── AdminMetricsPage.tsx
    │       └── AdminMetricsPage.test.tsx
    ├── routes/AdminRoutes.tsx                  ← AMPLIAR: <Route path="metrics" …/>
    └── components/layout/nav-config.ts         ← AMPLIAR: quitar `disabled` de "Métricas globales"
```

### Docs (fuente de verdad — actualizar como parte de la implementación)

- `docs/api-contract.md`: registrar `GET /api/admin/metrics/global` (query + respuesta).
- `docs/multi-tenancy.md` §5.3: citar `admin-metrics.service.ts` como la agregación global
  documentada del superadmin (solo conteos, nunca documentos).

## Contratos

### admin-metrics.types.ts
```ts
export type TenantEstado = 'activo' | 'suspendido' | 'prueba';
export type MetricsSortField =
  | 'nombre' | 'usuarios' | 'conversaciones' | 'mensajes'
  | 'leads' | 'ventas' | 'tasaConversion' | 'campanas';

export interface GlobalMetricsQuery {          // = z.infer del schema (no se duplica a mano)
  desde?: Date; hasta?: Date;
  page: number; limit: number;
  sort: MetricsSortField; order: 'asc' | 'desc';
  search?: string; estado?: TenantEstado;
}

export interface ITenantMetricsRow {
  tenantId: string; nombre: string; slug: string; estado: TenantEstado;
  plan: { _id: string; nombre: string } | null;
  usuarios: number; conversaciones: number; mensajes: number;
  leads: number; ventas: number; tasaConversion: number; campanas: number;
}

export interface IGlobalMetricsConsolidado {
  empresas: { total: number; porEstado: Record<TenantEstado, number> };
  planes: Array<{ planId: string | null; nombre: string; empresas: number }>;
  usuarios: { total: number; activos: number };
  conversaciones: { total: number; activas: number };
  mensajes: { inbound: number; outbound: number };
  leads: number; ventas: number; tasaConversion: number;
  campanas: { total: number; porEstado: Record<EstadoCampana, number> };
}

export interface IMonthlyPoint { periodo: string; conversaciones: number; leads: number; ventas: number; }

export interface IGlobalMetricsResponse {
  generadoAt: string;
  rango: { desde: string | null; hasta: string | null } | null;
  consolidado: IGlobalMetricsConsolidado;
  serieMensual: IMonthlyPoint[];
  porEmpresa: { items: ITenantMetricsRow[]; page: number; limit: number; total: number };
}
```
`EstadoCampana` se importa de `features/campaign/campaign.types.ts` (`ESTADOS_CAMPANA`); el estado
de la empresa reutiliza el tipo de `tenant.types.ts` si existe.

### admin-metrics.validation.ts (Zod)
```ts
const SORT_FIELDS = ['nombre','usuarios','conversaciones','mensajes','leads','ventas','tasaConversion','campanas'] as const;

export const globalMetricsQuerySchema = z.object({
  query: z.object({
    desde: z.coerce.date().optional(),
    hasta: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(SORT_FIELDS).default('leads'),
    order: z.enum(['asc', 'desc']).default('desc'),
    search: z.string().trim().max(80).optional(),
    estado: z.enum(['activo', 'suspendido', 'prueba']).optional(),
  }).refine((q) => !q.desde || !q.hasta || q.hasta >= q.desde, {
    message: '`hasta` debe ser igual o posterior a `desde`', path: ['hasta'],
  }),
});
export type GlobalMetricsQueryInput = z.infer<typeof globalMetricsQuerySchema>['query'];
```
- `hasta` se normaliza a fin de día (`23:59:59.999` UTC) en el service si viene sin hora.
- Revisar cómo `validate.middleware` reasigna `req.query` (regresión conocida de `?activo=` en
  `plan.routes.test.ts`): el controller lee el query **ya parseado** que deja el middleware.

### admin-metrics.service.ts

```ts
export async function getGlobalMetrics(q: GlobalMetricsQueryInput, now = new Date()): Promise<IGlobalMetricsResponse>
```

Pasos:
1. `createdAtMatch = rango ? { createdAt: { $gte: desde, $lte: hasta } } : {}`.
2. `Promise.all` de agregaciones independientes — **cada una con comentario
   `// Excepción superadmin cross-tenant (docs/multi-tenancy.md §5.3): solo conteos agrupados por tenantId.`**:

| Agregación | Pipeline | Devuelve |
|---|---|---|
| `tenants` | `Tenant.find({}, { nombre:1, slug:1, estado:1, planId:1 }).lean()` | base del desglose (solo esos 4 campos) |
| `plans` | `Plan.find({ _id: { $in: planIds } }, { nombre:1 }).lean()` | `Map<planId, nombre>` |
| `usuarios` | `User.aggregate([{ $match:{ tenantId:{ $ne:null } } }, { $group:{ _id:'$tenantId', total:{ $sum:1 }, activos:{ $sum:{ $cond:['$activo',1,0] } } } }])` | `Map<tenantId, {total, activos}>` |
| `conversaciones` | `Cliente.aggregate([{ $match: createdAtMatch }, { $group:{ _id:'$tenantId', total:{ $sum:1 } } }])` + si hay rango: `activas` por `ultimoMensajeAt` en rango (sin rango: `activas` = con `ultimoMensajeAt` en los últimos 30 días) | `Map<tenantId, {total, activas}>` |
| `mensajes` | `Message.aggregate([{ $match: createdAtMatch }, { $group:{ _id:'$tenantId', inbound:{ $sum:{ $cond:[{ $eq:['$direccion','inbound'] },1,0] } }, outbound:{ $sum:{ $cond:[{ $eq:['$direccion','outbound'] },1,0] } } } }])` | `Map<tenantId, {inbound, outbound}>` |
| `leads` | `Lead.aggregate([{ $match: createdAtMatch }, { $group:{ _id:'$tenantId', leads:{ $sum:1 }, ventas:{ $sum:{ $cond:[{ $eq:['$estado', KEY_ESTADO_VENTA] },1,0] } } } }])` | `Map<tenantId, {leads, ventas}>` |
| `campanas` | `Campaign.aggregate([{ $match: createdAtMatch }, { $group:{ _id:{ t:'$tenantId', e:'$estado' }, n:{ $sum:1 } } }])` | `Map<tenantId, Record<EstadoCampana, number>>` |
| `serie` | `Lead.aggregate` y `Cliente.aggregate` con `$match createdAt >= inicioVentana` y `$group` por `{ $dateToString:{ format:'%Y-%m', date:'$createdAt', timezone:'UTC' } }` (leads + `ventas` con el mismo `$cond`) | puntos por periodo |

   - `KEY_ESTADO_VENTA = 'pagado'` se declara como constante exportada en `admin-metrics.types.ts`
     (o se reutiliza si `estado.types.ts` ya exporta una equivalente).
   - Todas las agregaciones **solo proyectan conteos** y `_id` de agrupación; nunca `$push` de
     documentos ni campos de contacto/mensaje.
3. **Merge en memoria** sobre la lista de tenants (solo IDs existentes → los `tenantId` huérfanos se
   descartan, criterio 5). Cada fila: lookups en los Maps con default 0;
   `tasaConversion = leads ? round4(ventas/leads) : 0`; `mensajes = inbound + outbound`;
   `campanas = Σ porEstado`.
4. **Consolidado** desde **todas** las filas (antes de filtrar/paginar) → criterio 3. `empresas.porEstado`
   y `planes` se derivan de la lista de tenants (con `"Sin plan"` para `planId` nulo o plan borrado).
5. **Desglose:** filtra por `estado` y `search` (regex escapado, case-insensitive, sobre
   `nombre`/`slug`) → ordena por `sort/order` con desempate `nombre` asc (`localeCompare('es')`) →
   `total = filas.length` → `items = slice((page-1)*limit, page*limit)`.
6. **Serie mensual:** genera los 6 periodos `YYYY-MM` que terminan en el mes de `hasta ?? now`
   (UTC) y rellena con ceros los ausentes → criterio 7. Es independiente de `desde`.

> **Por qué merge en memoria y no un `$lookup` gigante desde `tenants`:** cada `$group` usa el
> índice con prefijo `tenantId` de su colección y las colecciones grandes (`messages`, `clientes`) no
> se cruzan entre sí; el número de tenants es pequeño (decenas/cientos), así que ordenar y paginar en
> memoria es O(N) trivial y permite ordenar por cualquier métrica. Si N crece a miles: materializar
> métricas en un job BullMQ nocturno (fuera de alcance; anotado como deuda).

### admin-metrics.controller.ts
```ts
export async function getGlobalMetricsController(req: Request, res: Response): Promise<void> {
  const result = await getGlobalMetrics(req.query as unknown as GlobalMetricsQueryInput);
  res.json(result);
}
```
Sin `try/catch`, sin Mongoose, sin lógica. (Usar el mecanismo que ya use el proyecto para leer el
query validado; el cast anterior es ilustrativo — evitar `unknown as` si hay helper tipado.)

### admin-metrics.routes.ts
```
// Rutas de Superadmin: authenticateJWT → authorize(['superadmin']) → validate → asyncHandler
// SIN requireTenant (superadmin no pertenece a ningún tenant) — docs/multi-tenancy.md §5.3 / §6
GET /api/admin/metrics/global → validate(globalMetricsQuerySchema) → getGlobalMetricsController
```

### app.ts
Montar en el bloque "Rutas de Superadmin (cross-tenant, sin requireTenant)", junto a
`/api/admin/tenants` y `/api/admin/plans`:
```ts
app.use('/api/admin/metrics', adminMetricsRoutes);
```

### Índices
Ninguno nuevo. Las agregaciones aprovechan los índices existentes con prefijo `tenantId`
(`leads {tenantId, createdAt}`, `campaigns {tenantId, createdAt}`, `messages {tenantId, …}`,
`clientes {tenantId, …}`); `tenants` y `plans` son colecciones pequeñas. Sin jobs BullMQ: la
consulta es de lectura y síncrona en el MVP.

## Frontend

### Dependencias
- `pnpm --filter @sofiapp/web add recharts` (versión estable compatible con React 19).
- `pnpm dlx shadcn@latest add chart` (desde `apps/frontend`) → `src/components/ui/chart.tsx`
  (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`). Los tokens
  `--chart-1..5` ya existen en `src/index.css` para light y dark; no se agregan colores nuevos.

### Datos
- `src/api/admin-metrics.ts`: `getGlobalMetrics(params: GlobalMetricsParams): Promise<GlobalMetricsResponse>`
  con `apiClient.get('/admin/metrics/global', { params })` (nunca `fetch` directo).
- `features/admin-metrics/types/`: `domain.ts` (espejo de la respuesta del backend), `api.ts`
  (`GlobalMetricsParams`), `index.ts` (barrel) — mismo patrón que `features/admin-plans/types/`.
- `hooks/useGlobalMetrics.ts`: `useQuery({ queryKey: ['admin','metrics','global', params], queryFn,
  placeholderData: keepPreviousData, staleTime: 60_000 })` — patrón de
  `features/admin-plans/hooks/useExchangeRate.ts`.
- `hooks/useMetricsFilters.ts`: rango, `page`, `sort`, `order`, `search` (debounced con
  `hooks/use-debounced-value.ts`) y `estado` en `useSearchParams` → URL compartible.
  **Sin Zustand:** no hay estado compartido entre pantallas.

### Componentes (todos con `components/ui/*`)
| Componente | UI base | Dato |
|---|---|---|
| `MetricsFilters` | `Select` (presets), `Input type=date`, `Button` | rango |
| `KpiCards` | `Card`, `Badge`, `Skeleton` | `consolidado` |
| `PlanDistributionChart` | `Card` + `ChartContainer` + `PieChart` (donut) | `consolidado.planes` |
| `TenantStatusChart` | `Card` + `BarChart` | `consolidado.empresas.porEstado` |
| `MonthlyTrendChart` | `Card` + `LineChart` (3 series) | `serieMensual` |
| `TopTenantsChart` | `Card` + `Tabs` + `BarChart layout="vertical"` | top 10 de `porEmpresa` (pide `sort=leads|ventas&limit=10` con una 2.ª query ligera, o reutiliza la página si ya está ordenada por esa métrica) |
| `TenantMetricsTable` | `Table`, `Input`, `Select`, `Badge`, `Button` | `porEmpresa` |
| `AdminMetricsPage` | composición + estados loading/vacío/error (`Alert`) | — |

- Formato numérico con `Intl.NumberFormat('es-CO')`; porcentajes con 1 decimal.
- Accesibilidad: cada gráfica con título y `aria-label`; la tabla es la vista accesible del dato.
- Antes de escribir componentes: invocar `emil-design-eng`, `impeccable:impeccable`,
  `frontend-design:frontend-design` y `dataviz` (CLAUDE.md regla 7).

### Ruteo
- `routes/AdminRoutes.tsx`: `<Route path="metrics" element={<AdminMetricsPage />} />` (el guard
  `rol !== 'superadmin' → <Navigate to="/" />` ya envuelve todas las rutas admin).
- `components/layout/nav-config.ts`: quitar `disabled: true` del ítem "Métricas globales".

## Trazabilidad criterio → implementación

| CA | Dónde |
|---|---|
| 1 | `admin-metrics.routes.ts` + montaje `app.ts` · `routes.test` |
| 2 | `globalMetricsQuerySchema` · `routes.test` (400) |
| 3, 4, 5 | `getGlobalMetrics` pasos 2–4 · `service.test` |
| 6 | `createdAtMatch` · `service.test` (rango) |
| 7 | paso 6 serie · `service.test` |
| 8 | paso 5 desglose · `service.test` |
| 9 | frontend completo · `AdminMetricsPage.test.tsx` + build |
| 10 | comentarios §5.3, proyección solo conteos · `isolation.test` + typecheck |

## Notas
- `tenantId` **no** nace del token aquí: el superadmin no tiene tenant (`tenantId: null`). Es la
  excepción §5.3; la ruta nunca recibe `tenantId` por body/params/query (no hay filtro por tenant
  en la query: el desglose cubre a todos).
- Ninguna función `*Scoped` ni ruta tenant se modifica; las lecturas directas viven **solo** en
  `admin-metrics.service.ts`.
- "Ventas en rango" usa `createdAt` del lead (no hay fecha de transición a `pagado`); documentado
  en el spec como limitación aceptada.
- Si `validate.middleware` no permite reasignar `req.query` en Express 5, seguir el patrón ya
  resuelto en `plan.validation.ts` / `tenant.validation.ts` (`listTenantsSchema`).

## Verificación
- `pnpm --filter @sofiapp/api typecheck` (alias "backend") — `tsc --noEmit` en verde.
- `pnpm --filter @sofiapp/api test` — routes, service y **isolation** en verde.
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` (alias "frontend").
- Manual: login superadmin → `/admin/metrics` en light y dark; login admin → redirige a `/`.
