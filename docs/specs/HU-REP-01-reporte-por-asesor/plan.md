# HU-REP-01 — Plan técnico (CÓMO)

## Árbol de archivos a crear / modificar

### Backend

```
apps/backend/src/
├── utils/date-range.ts                         ← CREAR: normalizeHasta, ratio, DIA_MS (movidos de admin-metrics)
├── features/admin-metrics/admin-metrics.service.ts  ← TOCAR: importar normalizeHasta/ratio de utils (re-exportar)
├── features/audit/audit.model.ts               ← AMPLIAR: índice { tenantId:1, accion:1, createdAt:-1 }
├── middlewares/authorize-subrol.middleware.ts  ← AMPLIAR: SUBROLES_REPORTES = ['director','manager']
├── features/reports/                           ← CREAR (tenant-scoped; sin model, como conversation/)
│   ├── reports.types.ts
│   ├── reports.validation.ts                   # advisorReportQuerySchema
│   ├── reports.service.ts                      # getAdvisorReport(tenantId, q)
│   ├── reports.controller.ts
│   ├── reports.routes.ts                       # GET /by-advisor
│   ├── reports.fixtures.ts                     # solo tests (patrón admin-metrics.fixtures)
│   ├── reports.routes.test.ts
│   ├── reports.service.test.ts
│   └── reports.isolation.test.ts
└── app.ts                                      ← AMPLIAR: app.use('/api/reports', reportsRoutes)
```

> **Sin `reports.model.ts`:** el reporte no persiste; proyecta sobre `Cliente`, `Message`, `Lead`,
> `AuditEvent` y `User` (excepción ya admitida en `apps/backend/CLAUDE.md` para `conversation/`).

### Frontend

```
apps/frontend/src/
├── components/charts/ChartCard.tsx             ← MOVER desde features/admin-metrics/components (ChartCard + ChartEmpty)
├── lib/format.ts                               ← CREAR: formatEntero, formatPorcentaje (movidos de admin-metrics/lib/format.ts)
├── hooks/use-period-params.ts                  ← CREAR: presets de periodo + URL (extraído de useMetricsFilters)
├── lib/roles.ts                                ← AMPLIAR: SUBROLES_REPORTES + puedeVerReportes(user)
├── api/reports.ts                              ← CREAR: getAdvisorReport(params) vía apiClient
├── features/admin-metrics/**                   ← TOCAR: importar las piezas movidas (sin cambio de comportamiento)
├── features/reports/                           ← CREAR
│   ├── types/{domain.ts, api.ts, index.ts}
│   ├── hooks/useAdvisorReport.ts               # useQuery + keepPreviousData + staleTime 60s
│   ├── components/
│   │   ├── AdvisorKpiStrip.tsx
│   │   ├── AdvisorBarsChart.tsx                # Tabs: Comparar (agrupadas) / Tasa de cierre
│   │   └── AdvisorTable.tsx
│   └── pages/{AdvisorReportPage.tsx, AdvisorReportPage.test.tsx}
├── components/RequireSubrol.tsx                ← CREAR: guard de UI por subrol (redirige a "/")
├── components/layout/nav-config.ts             ← AMPLIAR: ítem "Productividad por asesor" (+ visibilidad por subrol)
└── router.tsx                                  ← AMPLIAR: /reports/advisors con lazy() + RequireRole + RequireSubrol
```

### Docs

- `docs/adr/0011-reportes-por-subrol.md` — CREAR (y enlazar en `docs/adr/README.md`).
- `docs/domain.md` — sección "Productividad por asesor": definiciones de atendida, venta cerrada,
  tasa de cierre y limitaciones.
- `docs/data-model.md` — índice nuevo de `audit_events`; nota de que `lead.estado` es la fuente de
  la fecha de venta.
- `docs/api-contract.md` — `GET /api/reports/by-advisor`.

## Contratos

### reports.types.ts
```ts
export const KEY_ESTADO_VENTA = 'pagado';               // o import compartido si se extrae
export const ACCIONES_ETAPA_LEAD = ['lead.estado', 'lead.update'] as const;
export const RANGO_DEFAULT_DIAS = 30;
export const RANGO_MAX_DIAS = 366;

export interface IAdvisorRow {
  asesorId: string; nombre: string; activo: boolean;
  conversacionesAtendidas: number; asignadasActivas: number;
  ventas: number; tasaCierre: number;
}
export interface IAdvisorReportResponse {
  generadoAt: string;
  rango: { desde: string; hasta: string };
  totales: { asesores: number; conversacionesAtendidas: number; asignadasActivas: number; ventas: number; tasaCierre: number };
  porAsesor: IAdvisorRow[];
  sinAsignar: { conversacionesAtendidas: number; ventas: number };
}
```

### reports.validation.ts (Zod)
```ts
export const advisorReportQuerySchema = z.object({
  query: z.object({
    desde: z.coerce.date().optional(),
    hasta: z.coerce.date().optional(),
  })
  .refine((q) => !q.desde || !q.hasta || q.hasta >= q.desde, { path: ['hasta'], message: '`hasta` debe ser igual o posterior a `desde`.' })
  .refine((q) => !q.desde || !q.hasta || (q.hasta.getTime() - q.desde.getTime()) <= RANGO_MAX_DIAS * DIA_MS,
          { path: ['desde'], message: 'El rango no puede superar 366 días.' }),
});
export type AdvisorReportQuery = z.infer<typeof advisorReportQuerySchema>['query'];
```
El service resuelve defaults (`hasta = now`, `desde = hasta − 29 días` a medianoche UTC) y aplica
`normalizeHasta`.

### reports.routes.ts
```
// Ruta de tenant: authenticateJWT → requireTenant → authorize(['admin']) →
// authorizeSubrol(SUBROLES_REPORTES) → validate → asyncHandler   (ADR 0011)
GET /api/reports/by-advisor → getAdvisorReportController
```

### reports.controller.ts
```ts
export async function getAdvisorReportController(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId!.toString();
  res.json(await getAdvisorReport(tenantId, req.validatedQuery as unknown as AdvisorReportQuery));
}
```

### reports.service.ts — `getAdvisorReport(tenantId, q, now = new Date()): Promise<IAdvisorReportResponse>`

Todas las lecturas por `aggregateScoped` / `findScoped` (`repositories/base.repository.ts`), que
anteponen `$match { tenantId: ObjectId }`. `Promise.all` de:

| Agregación | Pipeline (tras el `$match tenantId` automático) | Resultado |
|---|---|---|
| **Atendidas** | `aggregateScoped(Message)`: `$match { sender:'agent', createdAt∈rango }` → `$group { _id:'$clienteId' }` → `$lookup` a `clientes` con `let: { cid:'$_id' }` y `pipeline: [$match { $expr: { $and: [ {$eq:['$_id','$$cid']}, {$eq:['$tenantId', tenantOid]} ] } }, $project { asesorId:1, metaUserId:1 }]` → `$unwind` → `$match { 'c.metaUserId': { $not: /^demo-/ } }` → `$group { _id:'$c.asesorId', n:{$sum:1} }` | `Map<asesorId|null, n>` |
| **Asignadas activas** | `aggregateScoped(Cliente)`: `$match { asesorId:{$ne:null}, ultimoMensajeAt∈rango, metaUserId:{$not:/^demo-/} }` → `$group { _id:'$asesorId', n }` | `Map<asesorId, n>` |
| **Ventas** | `aggregateScoped(AuditEvent)`: `$match { entidad:'lead', accion:{$in:ACCIONES_ETAPA_LEAD}, 'despues.estado':'pagado', createdAt∈rango }` → `$group { _id:'$entidadId' }` (dedupe) → `$lookup` a `leads` (`$expr` sobre `_id` **y** `tenantId`) con `$project { estado:1, responsableId:1 }` → `$unwind` → `$match { 'l.estado': 'pagado' }` → `$group { _id:'$l.responsableId', n }` | `Map<responsableId|null, n>` |
| **Asesores** | `findScoped(User, tenantId, {})` `.select({ nombre:1, activo:1 }).lean()` | lista base |

- El `$lookup` **repite `tenantId` en el `$expr`**: un `_id` de otro tenant nunca se resuelve
  (defensa en profundidad; los ids son únicos, pero el invariante no depende de ello).
- Merge: filas = usuarios activos ∪ usuarios con cifras; claves nulas o fuera de la lista de
  usuarios → `sinAsignar`; `tasaCierre = ratio(ventas, atendidas)`; orden atendidas desc + nombre.
- Totales = Σ filas + `sinAsignar`; `asignadasActivas` total = Σ filas.

### Índice
`AuditEventSchema.index({ tenantId: 1, accion: 1, createdAt: -1 })` — sostiene el `$match` de
ventas. Los demás `$match` usan índices existentes (`messages {tenantId, clienteId, createdAt}`
→ evaluar `{tenantId, sender, createdAt}` si el explain lo pide; `clientes {tenantId, asesorId}`).

### ADR 0011 (resumen)
Contexto: AUTH-02 criterio 4 (subrol = metadata) y ADR 0006 (única excepción). Decisión: los
reportes de productividad del equipo se restringen a `director`/`manager` (+ admin sin subrol, por
el mismo motivo que 0006: nadie tiene subrol asignado hoy). Consecuencias: segundo uso de
`authorizeSubrol`; lista propia `SUBROLES_REPORTES` (no se reutiliza la de datos sensibles: son
decisiones distintas que hoy coinciden).

## Frontend

- **Extracción sin cambio de comportamiento:** `ChartCard`/`ChartEmpty` → `components/charts/`,
  `formatEntero`/`formatPorcentaje` → `lib/format.ts`, presets + URL → `hooks/use-period-params.ts`
  (parametrizable: `presets`, `defaultPreset`). `admin-metrics` importa de ahí; sus tests no cambian.
- `useAdvisorReport(params)`: `useQuery({ queryKey: ['reports','by-advisor', params], placeholderData:
  keepPreviousData, staleTime: 60_000 })`.
- `AdvisorBarsChart`: `ChartContainer` + `BarChart` con dos `Bar` (`var(--color-atendidas)` =
  `--chart-1`, `var(--color-ventas)` = `--chart-2`), `radius 4`, `ChartLegend`, tooltip; layout
  vertical si > 8 asesores; vista "Tasa de cierre" con `LabelList` en %. Mismos colores que HU-SAAS-03
  (Leads/Atendidas azul, Ventas naranja).
- `AdvisorKpiStrip`: mismo patrón visual que `KpiStrip` (franja `gap-px` sobre `bg-border`, celda
  Ventas con acento y `Progress`).
- `AdvisorTable`: `Table` shadcn, orden en cliente (los datos ya están completos), badge "Inactivo",
  fila "Sin asignar".
- Guards: `RequireRole roles={['admin']}` + `RequireSubrol permitidos={SUBROLES_REPORTES}`;
  `nav-config` con `visible: puedeVerReportes` (o filtro equivalente en `AppSidebar`).
- Ruta con `lazy()` + `Suspense fallback={<Loading />}`.
- Antes de cada componente: skills `frontend-design`, `dataviz` (y `emil-design-eng`,
  `impeccable:impeccable` si están instaladas).

## Trazabilidad

| CA | Plan | Test |
|---|---|---|
| 1 | routes + ADR | `reports.routes.test` |
| 2 | Zod + defaults | `reports.routes.test`, `service.test` |
| 3 | agregación Atendidas | `service.test` |
| 4 | agregación Ventas | `service.test` |
| 5, 6 | merge + sinAsignar | `service.test` (DoD) |
| 7 | índice audit | `service.test` (listIndexes) |
| 8 | docs + ADR | revisión |
| 9 | frontend | `AdvisorReportPage.test` + build |
| 10 | extracción | suites admin-metrics |
| 11 | scoped + `$expr tenantId` | `reports.isolation.test` |

## Notas
- `KEY_ESTADO_VENTA`: si al implementar conviene una sola fuente, mover la constante a
  `features/estado/estado.types.ts` y que admin-metrics y reports la importen.
- La fecha de venta sale de `audit_events`; `recordAuditEvent` es best-effort (no lanza). Un evento
  perdido haría que esa venta no aparezca — aceptado y documentado en domain.md.

## Verificación
- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test` (reports + admin-metrics + aislamiento).
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` · test de página.
- Manual: admin sin subrol / manager ven `/reports/advisors`; coordinator no ve el ítem y la URL redirige.
