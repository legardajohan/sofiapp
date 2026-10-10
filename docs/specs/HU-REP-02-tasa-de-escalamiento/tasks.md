# HU-REP-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. Ruta **de tenant**: `tenantId`
> solo del token y todas las lecturas por `aggregateScoped`. Nada de la excepción §5.3.

## 0. Rama
- [x] Trabajar sobre `feat/HU-REP-01` **sin** crear rama, sin checkout, sin push. Confirmar antes que
      HU-REP-01 ya está commiteada (si no, pedir al usuario cerrarla primero) para que los commits de
      esta historia queden separados.

## Backend — feature `reports/` (ampliación)
### 1. Types — `reports.types.ts`
- [x] `ACCION_HANDOFF`, `IHandoffMotivoRow`, `IHandoffRateResponse` (motivo tipado con `HandoffMotivo`).
### 2. Model
- [x] **No aplica** (proyecta sobre `AuditEvent`, `Message`, `Cliente`). Sin índice nuevo.
### 3. Validation — `reports.validation.ts`
- [x] Extraer `rangoReporteQuerySchema` + `RangoReporteQuery`; `advisorReportQuerySchema` y
      `handoffRateQuerySchema` lo reutilizan (tipos vía `z.infer`).
### 4. Service — `reports.service.ts`
- [x] `resolverRango` tipado con `RangoReporteQuery`.
- [x] Transferidas: `aggregateScoped(AuditEvent)` handoff en rango → orden → dedupe por `entidadId`
      (último motivo, nº eventos) → `lookupScoped` clientes → sin demo → por motivo.
- [x] Conversaciones con IA: `aggregateScoped(Message)` bot en rango → `$unionWith` audit_events
      (con `tenantId` explícito) → dedupe → `lookupScoped` clientes → sin demo → `$count`.
- [x] Merge: 5 motivos en orden, `transferidas`, `handoffsRegistrados`, `resueltasPorIa`,
      `tasaEscalamiento = ratio(...)`. Tipo de retorno explícito.
### 5. Controller — `reports.controller.ts`
- [x] `getHandoffRateController`: `tenantId` de `req.user!.tenantId`; sin try/catch ni Mongoose.
### 6. Routes — `reports.routes.ts`
- [x] `GET /handoff-rate`: `authenticateJWT, requireTenant, authorize(['admin']),
      authorizeSubrol(SUBROLES_REPORTES), validate(handoffRateQuerySchema), asyncHandler(...)`.
### 7. Montaje
- [x] **No aplica**: `/api/reports` ya está montado en `app.ts`.

## Tests (backend)
### 8. Fixtures
- [x] `crearHandoff(tenant, clienteId, at, motivo)` en `reports.fixtures.ts` (evento con `actorId: null`).
### 9. `reports.handoff.routes.test.ts`
- [x] 401 sin JWT · superadmin cortado por `requireTenant` (500) · 403 `coordinator` · 403 `secretary`
      · 200 admin sin subrol / `manager` / `director`.
- [x] 400: `hasta < desde`, fecha inválida, rango de 400 días. Sin query → rango de 30 días.
### 10. `reports.handoff.service.test.ts`
- [x] Hilo solo bot → denominador sí, numerador no. Hilo solo `agent` → no cuenta en nada.
- [x] Handoff en rango cuenta; fuera de rango no; dos handoffs del mismo hilo = 1 transferida y
      `handoffsRegistrados: 2`, motivo del último.
- [x] Handoff sin mensaje bot en el rango → cuenta en ambos (tasa ≤ 1).
- [x] Hilo devuelto a la IA (sin `handoffAt` en `Cliente`) sigue contando; hilo con IA apagada a mano
      sin evento no cuenta.
- [x] Hilos `demo-` excluidos de ambos; handoff huérfano (cliente borrado) excluido.
- [x] Sin datos → ceros, `tasaEscalamiento: 0`, 5 motivos en 0.
- [x] **DoD:** `transferidas` = `entidadId` distintos calculados aparte; tasa = `ratio`; Σ motivos =
      `transferidas`; `resueltasPorIa = conversacionesIa − transferidas`.
### 11. `reports.handoff.isolation.test.ts`
- [x] Tenants A y B: mensajes bot y handoffs de B no suman en A.
- [x] Un handoff de B con `entidadId` de un cliente de A no cuenta en A ni en B.
- [x] `?tenantId=<B>` se ignora.
- [x] Respuesta sin PII (teléfonos, nombres, correos, textos, nombres de condición sembrados).
### 12. Regresión
- [x] Suites de HU-REP-01 (`reports.*.test.ts`) y `admin-metrics` en verde.

## Docs
- [x] `docs/domain.md`: sección "Tasa de escalamiento" (fuente, numerador, denominador, exclusiones).
- [x] `docs/api-contract.md`: `GET /api/reports/handoff-rate`.
- [x] `docs/adr/0011-reportes-por-subrol.md`: enmienda (segundo reporte con el mismo gate).
- [x] `docs/data-model.md`: nota en `audit_events` sobre `conversation.handoff` como fuente.

## Frontend
> Antes de cada componente: `emil-design-eng`, `impeccable:impeccable`, `frontend-design:frontend-design`
> (+ `dataviz`). shadcn primero; light y dark con tokens semánticos.
### 13. Datos
- [x] `features/reports/types/*`: `HandoffRate`, `HandoffMotivoRow`, `ReportRangeParams`
      (`AdvisorReportParams` como alias).
- [x] `api/reports.ts`: `getHandoffRate` vía `apiClient` (`/reports/handoff-rate`, sin `/api`).
- [x] `hooks/useHandoffRate.ts`: queryKey `['reports','handoff-rate', params]`, `keepPreviousData`,
      `staleTime: 60_000`.
### 14. Componentes y página
- [x] `HandoffKpiStrip` (celda Tasa con `Progress`; IA, Transferidas, Resueltas por IA).
- [x] `HandoffDonutChart` (Pie donut `--chart-1`/`--chart-2`, % al centro, leyenda, tooltip; vacío).
- [x] `HandoffMotivoChart` (barras horizontales, `MOTIVO_LABEL`, valor rotulado, un solo eje).
- [x] `HandoffRatePage` (`PeriodFilter` + URL, rango legible, loading/vacío/error con reintento).
### 15. Ruteo y navegación
- [x] `router.tsx`: `/reports/handoff-rate` con `lazy()` + `Suspense` + `RequireRole(['admin'])` +
      `RequireReportes`.
- [x] `nav-config.ts`: ítem "Tasa de escalamiento" en "Reportes" con `subroles: SUBROLES_REPORTES`.
### 16. Test de página
- [x] `HandoffRatePage.test.tsx`: con la API mockeada pinta tasa, conteos y motivos; cambiar el preset
      pide el rango nuevo; vacío; error → reintentar.

## Verificación final
- [x] `pnpm --filter @sofiapp/api typecheck`
- [x] `pnpm --filter @sofiapp/api test` (service + routes + aislamiento de HU-REP-02, y regresión)
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` + test de página
- [ ] `/reports/handoff-rate` en light y dark; `coordinator` no ve el ítem y la URL redirige (capturas
      en `.playwright-mcp/`, borradas al terminar).
      **Pendiente:** no se arrancó la app en local (mismo bloqueo de `.env` que HU-REP-01).
- [x] Checklist PR `docs/multi-tenancy.md` §9: todo vía `*Scoped`; `tenantId` del token (también en
      `$lookup`/`$unionWith`); ruta con `requireTenant`; test de aislamiento presente.
- [ ] `git status` sin `*.png` sueltos; commits separados `feat(api)` / `feat(web)` / `docs(docs)`.
      **Pendiente:** se commitea al pedirlo (sin capturas generadas).

## Notas de implementación (desvíos respecto del plan)

- Rama: sin rama nueva, sobre `feat/HU-REP-01` (pedido explícito), con HU-REP-01 ya commiteada.
- Skills de diseño: `emil-design-eng` e `impeccable:impeccable` no están instaladas en este entorno;
  se aplicaron `frontend-design:frontend-design` y `dataviz`, y el patrón visual de HU-REP-01.
- KPI strip: la celda con acento (Tasa de escalamiento) va **primera**, no última como en
  `AdvisorKpiStrip`: es la respuesta directa a la historia.
- Barras por motivo: los motivos en 0 se atenúan con un `tick` propio del eje Y; un solo color
  (`--chart-2`, el mismo de "Transferidas" en el donut).
- Ítem de menú con icono `PieChart` (`ArrowRightLeft` ya lo usa otra entrada).

## Definición de "hecho"
- Criterios 1–10 de `spec.md` verificados; DoD (transferidas = handoffs distintos del periodo)
  cubierto por test.
- Docs y enmienda de ADR 0011 publicados.
- `spec.md` → `**Estado:** implementado` (lo hace `/sdd-implement`).
