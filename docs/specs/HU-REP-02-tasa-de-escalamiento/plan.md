# HU-REP-02 — Plan técnico (CÓMO)

## Árbol de archivos a crear / modificar

### Backend

```
apps/backend/src/features/reports/
├── reports.types.ts                   ← AMPLIAR: ACCION_HANDOFF, IHandoffMotivoRow, IHandoffRateResponse
├── reports.validation.ts              ← AMPLIAR: extraer rangoReporteQuerySchema; advisor/handoff lo reutilizan
├── reports.service.ts                 ← AMPLIAR: getHandoffRate(tenantId, q, now); resolverRango tipado con RangoReporteQuery
├── reports.controller.ts              ← AMPLIAR: getHandoffRateController
├── reports.routes.ts                  ← AMPLIAR: GET /handoff-rate (misma cadena)
├── reports.fixtures.ts                ← AMPLIAR: crearHandoff(tenant, clienteId, at, motivo)
├── reports.handoff.service.test.ts    ← CREAR
├── reports.handoff.routes.test.ts     ← CREAR
└── reports.handoff.isolation.test.ts  ← CREAR
```

> Sin modelo nuevo ni montaje nuevo en `app.ts`: el router ya cuelga de `/api/reports`. Sin índice
> nuevo: `audit_events { tenantId, accion, createdAt }` (HU-REP-01) sostiene el numerador; el
> `$match` de mensajes `bot` usa el mismo camino que `contarAtendidas` (evaluar
> `messages { tenantId, sender, createdAt }` con explain si el volumen lo pide — no en esta historia).
> Tests en suites propias para no engordar las de HU-REP-01.

### Frontend

```
apps/frontend/src/
├── api/reports.ts                          ← AMPLIAR: getHandoffRate(params)
├── features/reports/
│   ├── types/{domain.ts, api.ts, index.ts} ← AMPLIAR: HandoffRate, HandoffMotivoRow, ReportRangeParams
│   ├── hooks/useHandoffRate.ts             ← CREAR (camelCase, como useAdvisorReport.ts)
│   ├── components/
│   │   ├── HandoffKpiStrip.tsx             ← CREAR
│   │   ├── HandoffDonutChart.tsx           ← CREAR (Pie: resueltas por IA vs transferidas)
│   │   └── HandoffMotivoChart.tsx          ← CREAR (barras horizontales por motivo)
│   └── pages/{HandoffRatePage.tsx, HandoffRatePage.test.tsx} ← CREAR
├── components/layout/nav-config.ts         ← AMPLIAR: ítem "Tasa de escalamiento" en "Reportes"
└── router.tsx                              ← AMPLIAR: /reports/handoff-rate con lazy() + RequireRole + RequireReportes
```

Reutiliza sin tocar: `components/charts/{ChartCard,PeriodFilter}.tsx`, `hooks/use-period-params.ts`,
`lib/format.ts` (`formatPorcentaje`, `formatEntero`), `components/RequireReportes.tsx`,
`lib/roles.ts` (`puedeVerReportes`), `features/handoff/types.ts` (`MOTIVO_LABEL`, `HandoffMotivo`),
`components/ui/chart.tsx`.

### Docs

- `docs/domain.md` — sección "Tasa de escalamiento" (definiciones y exclusiones) junto a
  "Productividad por asesor".
- `docs/api-contract.md` — fila `GET /api/reports/handoff-rate`.
- `docs/adr/0011-reportes-por-subrol.md` — enmienda: el gate cubre también la tasa de escalamiento.
- `docs/data-model.md` — nota en `audit_events`: `conversation.handoff` es la fuente del reporte.

## Contratos

### reports.types.ts

```ts
export const ACCION_HANDOFF = 'conversation.handoff' as const;

export interface IHandoffMotivoRow { motivo: HandoffMotivo; conversaciones: number }

export interface IHandoffRateResponse {
  generadoAt: string;
  rango: { desde: string; hasta: string };
  conversacionesIa: number;
  transferidas: number;
  resueltasPorIa: number;
  handoffsRegistrados: number;
  /** `transferidas / conversacionesIa`, 4 decimales; 0 sin conversaciones con IA. */
  tasaEscalamiento: number;
  /** Los 5 motivos en el orden de `MOTIVOS_HANDOFF`; Σ = transferidas. */
  transferidasPorMotivo: IHandoffMotivoRow[];
}
```

`HandoffMotivo`/`MOTIVOS_HANDOFF` se importan de `features/ai/ai-handoff.types.ts` (fuente única).

### reports.validation.ts (Zod)

```ts
export const rangoReporteQuerySchema = z.object({ query: /* el objeto + 2 refine actuales */ });
export type RangoReporteQuery = z.infer<typeof rangoReporteQuerySchema>['query'];
export const advisorReportQuerySchema = rangoReporteQuerySchema;   // sin cambio para HU-REP-01
export type AdvisorReportQuery = RangoReporteQuery;
export const handoffRateQuerySchema = rangoReporteQuerySchema;
export type HandoffRateQuery = RangoReporteQuery;
```

`resolverRango(q: RangoReporteQuery, now)` — misma implementación.

### reports.routes.ts

```
// Ruta de tenant (ADR 0011): misma cadena que /by-advisor
GET /api/reports/handoff-rate → authenticateJWT, requireTenant, authorize(['admin']),
  authorizeSubrol(SUBROLES_REPORTES), validate(handoffRateQuerySchema), asyncHandler(getHandoffRateController)
```

### reports.controller.ts

```ts
export async function getHandoffRateController(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId!.toString();
  res.json(await getHandoffRate(tenantId, req.validatedQuery as unknown as HandoffRateQuery));
}
```

### reports.service.ts — `getHandoffRate(tenantId, q, now = new Date()): Promise<IHandoffRateResponse>`

`Promise.all` de dos agregaciones, ambas con `aggregateScoped` (antepone `$match { tenantId }`):

| Agregación | Pipeline (tras el `$match tenantId` automático) | Resultado |
|---|---|---|
| **Transferidas** | `aggregateScoped(AuditEvent)`: `$match { accion: ACCION_HANDOFF, entidad:'cliente', createdAt∈rango }` → `$sort { createdAt: 1, _id: 1 }` → `$group { _id:'$entidadId', eventos:{$sum:1}, motivo:{$last:'$despues.motivo'} }` → `lookupScoped(clientes, tenantOid, '$_id', { metaUserId:1 }, 'c')` → `$unwind '$c'` → `$match { 'c.metaUserId': { $not: PREFIJO_CLIENTE_DEMO } }` → `$group { _id:'$motivo', conversaciones:{$sum:1}, eventos:{$sum:'$eventos'} }` | filas por motivo → `transferidas` = Σ conversaciones, `handoffsRegistrados` = Σ eventos |
| **Conversaciones con IA** | `aggregateScoped(Message)`: `$match { sender:'bot', createdAt∈rango }` → `$group { _id:'$clienteId' }` → `$unionWith { coll: audit_events, pipeline: [ $match { tenantId: tenantOid, accion: ACCION_HANDOFF, entidad:'cliente', createdAt∈rango }, $group { _id:'$entidadId' } ] }` → `$group { _id:'$_id' }` (dedupe) → `lookupScoped(clientes, …, { metaUserId:1 }, 'c')` → `$unwind` → `$match` no demo → `$count: 'n'` | `conversacionesIa` |

- El `$unionWith` **lleva `tenantId` explícito** en su `$match` (el prefijo de `aggregateScoped` solo
  cubre la colección de origen). Igual que `lookupScoped`, que repite `tenantId` en `$expr`.
- Merge: `transferidasPorMotivo = MOTIVOS_HANDOFF.map(m => ({ motivo: m, conversaciones: fila(m) ?? 0 }))`;
  un motivo desconocido no entra al desglose (no ocurre: `handoffConversation` siempre escribe uno).
- `tasaEscalamiento = ratio(transferidas, conversacionesIa)`; `resueltasPorIa = conversacionesIa − transferidas`.

## Frontend

- `useHandoffRate(params)`: `useQuery({ queryKey: ['reports','handoff-rate', params], queryFn,
  placeholderData: keepPreviousData, staleTime: 60_000 })`.
- `AdvisorReportParams` pasa a ser alias de un `ReportRangeParams { desde?; hasta? }` común.
- `HandoffKpiStrip`: mismo patrón visual que `AdvisorKpiStrip` (franja `gap-px` sobre `bg-border`);
  celda "Tasa de escalamiento" con acento y `Progress`.
- `HandoffDonutChart`: `ChartContainer` + `PieChart` con `Pie innerRadius` (donut), dos porciones
  `--chart-1` (Resueltas por IA) y `--chart-2` (Transferidas), % al centro (`Label`), `ChartLegend`,
  tooltip con conteo + %. `ChartEmpty` si `conversacionesIa === 0`.
- `HandoffMotivoChart`: `BarChart layout="vertical"`, un eje de conversaciones, `MOTIVO_LABEL`,
  `LabelList`, color único `--chart-2` (todas son transferidas).
- `HandoffRatePage`: `usePeriodParams({ presets: ['7d','30d','mes','personalizado'], defaultPreset: '30d' })`,
  `PeriodFilter`, cabecera con rango legible, error con reintento (patrón `AdvisorReportPage`).
- Ruta `lazy()` + `Suspense` dentro de `RequireRole(['admin'])` + `RequireReportes`; ítem de menú
  con `roles: ['admin'], subroles: SUBROLES_REPORTES`.
- **Antes de cada componente:** skills `emil-design-eng`, `impeccable:impeccable`,
  `frontend-design:frontend-design` (+ `dataviz` para los gráficos); shadcn primero; light y dark.

## Trazabilidad

| CA | Plan | Test |
|---|---|---|
| 1 | routes | `reports.handoff.routes.test` |
| 2 | schema compartido + `resolverRango` | `reports.handoff.routes.test` |
| 3 | agregación Transferidas | `reports.handoff.service.test` |
| 4 | agregación Conversaciones con IA (`$unionWith`) | `reports.handoff.service.test` |
| 5, 6 | merge + motivos | `reports.handoff.service.test` (DoD) |
| 7 | docs + ADR | revisión |
| 8 | frontend | `HandoffRatePage.test` + build |
| 9 | schema compartido | suites HU-REP-01 |
| 10 | scoped + `tenantId` en `$lookup`/`$unionWith` | `reports.handoff.isolation.test` |

## Notas

- `recordAuditEvent` es best-effort: un evento de handoff perdido no aparece en el reporte. Mismo
  criterio aceptado en HU-REP-01; documentado en `domain.md`.
- Commits (al implementar, sobre `feat/HU-REP-01`, sin rama nueva): `feat(api): add handoff rate
  report endpoint`, `feat(web): add handoff rate dashboard`, `docs(docs): document handoff rate report`.
  Para no mezclar historias, HU-REP-01 (hoy sin commit en el árbol) debe confirmarse antes.

## Verificación

- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test` (reports completo).
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` · test de página.
- Manual: manager ve `/reports/handoff-rate` en light y dark; coordinator no ve el ítem y la URL redirige.
