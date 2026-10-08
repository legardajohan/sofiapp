# HU-REP-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. Ruta **de tenant**: `tenantId`
> solo del token y todas las lecturas por `aggregateScoped`/`findScoped`. Nada de la excepción §5.3.

## 0. Rama
- [ ] Crear `feat/HU-REP-01` desde `develop` (con HU-SAAS-03 ya integrada, de la que depende).

## Backend — piezas compartidas
### 1. `utils/date-range.ts`
- [ ] Mover `normalizeHasta`, `ratio`, `DIA_MS` desde `admin-metrics.service.ts`; admin-metrics los importa (y re-exporta para sus tests).
### 2. Autorización
- [ ] `SUBROLES_REPORTES = ['director','manager']` en `authorize-subrol.middleware.ts`.
### 3. Índice
- [ ] `audit.model.ts`: `AuditEventSchema.index({ tenantId: 1, accion: 1, createdAt: -1 })`.

## Backend — feature `reports/`
### 4. Types — `reports.types.ts`
- [ ] Constantes (`ACCIONES_ETAPA_LEAD`, `RANGO_DEFAULT_DIAS`, `RANGO_MAX_DIAS`, clave de venta), `IAdvisorRow`, `IAdvisorReportResponse`.
### 5. Model
- [ ] **No aplica** (proyecta sobre `Cliente`, `Message`, `Lead`, `AuditEvent`, `User`).
### 6. Validation — `reports.validation.ts`
- [ ] `advisorReportQuerySchema` (`hasta >= desde`, rango ≤ 366 días) + `AdvisorReportQuery` vía `z.infer`.
### 7. Service — `reports.service.ts`
- [ ] Resolver rango por defecto (30 días) + `normalizeHasta`.
- [ ] Atendidas: `aggregateScoped(Message)` agent en rango → `$lookup` clientes (con `tenantId` en `$expr`) → excluir `demo-` → por `asesorId`.
- [ ] Asignadas activas: `aggregateScoped(Cliente)`.
- [ ] Ventas: `aggregateScoped(AuditEvent)` transición a `pagado` en rango → dedupe lead → `$lookup` leads (con `tenantId`) → sigue `pagado` → por `responsableId`.
- [ ] Asesores: `findScoped(User)` `nombre`/`activo`.
- [ ] Merge: activos + con cifras; nulos/huérfanos a `sinAsignar`; `tasaCierre`; orden; totales.
### 8. Controller — `reports.controller.ts`
- [ ] `tenantId` de `req.user!.tenantId`; query de `req.validatedQuery`; sin try/catch ni Mongoose.
### 9. Routes — `reports.routes.ts`
- [ ] `GET /by-advisor`: `authenticateJWT, requireTenant, authorize(['admin']), authorizeSubrol(SUBROLES_REPORTES), validate(...), asyncHandler(...)`.
### 10. Montaje
- [ ] `app.ts`: `app.use('/api/reports', reportsRoutes)` en el bloque de rutas de tenant.

## Tests (backend)
### 11. `reports.routes.test.ts`
- [ ] 401 sin JWT · 403 superadmin · 403 `coordinator` · 403 `secretary` · 200 admin sin subrol / `manager` / `director`.
- [ ] 400: `hasta < desde`, fecha inválida, rango de 400 días. Sin query → rango de 30 días.
### 12. `reports.service.test.ts`
- [ ] Atendida exige respuesta `agent` en el rango; solo bot no cuenta; fuera de rango no cuenta.
- [ ] Hilos `demo-` excluidos; hilo reasignado cuenta para el asesor actual.
- [ ] Venta: lead viejo pagado en el rango cuenta; pagado fuera del rango no; pagado y revertido no; doble transición cuenta una vez; evento legacy `lead.update` cuenta; atribución a `responsableId` (no al actor).
- [ ] Asesor activo sin actividad = 0; inactivo con cifras aparece; inactivo sin cifras no; ids huérfanos/nulos en `sinAsignar`.
- [ ] **DoD:** totales = Σ filas + `sinAsignar` = conteos operativos calculados aparte en el test.
- [ ] Índice `{ tenantId, accion, createdAt }` presente en `audit_events`.
### 13. `reports.isolation.test.ts`
- [ ] Tenants A y B con asesores, clientes, mensajes, leads y eventos distintos: el reporte de A no incluye nada de B (incluido un `responsableId`/`asesorId` de A usado en datos de B).
- [ ] Respuesta sin PII: ni teléfonos, nombres de contacto, correos ni textos sembrados.
- [ ] El `tenantId` en query/body se ignora (`?tenantId=<B>` no cambia nada).
### 14. Regresión
- [ ] Suites de `admin-metrics` en verde tras mover helpers.

## Docs
- [ ] `docs/adr/0011-reportes-por-subrol.md` + índice en `docs/adr/README.md`.
- [ ] `docs/domain.md`: definiciones de conversación atendida, venta cerrada, tasa de cierre y limitaciones.
- [ ] `docs/data-model.md`: índice nuevo de `audit_events`.
- [ ] `docs/api-contract.md`: `GET /api/reports/by-advisor`.

## Frontend
> Antes de cada componente: `frontend-design`, `dataviz` (y `emil-design-eng`, `impeccable:impeccable` si existen). shadcn primero; light y dark.
### 15. Piezas compartidas (sin cambio de comportamiento)
- [ ] `components/charts/ChartCard.tsx` (+ `ChartEmpty`), `lib/format.ts`, `hooks/use-period-params.ts`; admin-metrics pasa a importarlas.
- [ ] `lib/roles.ts`: `SUBROLES_REPORTES`, `puedeVerReportes(user)`; `components/RequireSubrol.tsx`.
### 16. Datos
- [ ] `features/reports/types/*`, `src/api/reports.ts` (`apiClient`, sin `/api`), `hooks/useAdvisorReport.ts`.
### 17. Componentes y página
- [ ] `AdvisorKpiStrip` (celda Ventas con medidor de tasa).
- [ ] `AdvisorBarsChart` (Tabs Comparar / Tasa de cierre; `--chart-1` atendidas, `--chart-2` ventas; horizontal > 8 asesores).
- [ ] `AdvisorTable` (orden en cliente, badge Inactivo, fila Sin asignar).
- [ ] `AdvisorReportPage` (periodo en URL, loading/vacío/error con reintento).
### 18. Ruteo y navegación
- [ ] `router.tsx`: `/reports/advisors` con `lazy()` + `Suspense` + `RequireRole(['admin'])` + `RequireSubrol`.
- [ ] `nav-config.ts`: ítem "Productividad por asesor", oculto si `!puedeVerReportes(user)`.
### 19. Test de página
- [ ] `AdvisorReportPage.test.tsx`: renderiza KPIs y filas con la API mockeada; cambia el preset y pide el rango nuevo; error → reintentar.

## Verificación final
- [ ] `pnpm --filter @sofiapp/api typecheck`
- [ ] `pnpm --filter @sofiapp/api test` (reports + admin-metrics + aislamiento)
- [ ] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` + test de página
- [ ] `/reports/advisors` en light y dark; `coordinator` no ve el ítem y la URL redirige (capturas en `.playwright-mcp/`, borradas).
- [ ] Checklist PR `docs/multi-tenancy.md` §9: todo vía `*Scoped`; `tenantId` del token; ruta tenant con `requireTenant`; test de aislamiento presente.

## Definición de "hecho"
- Criterios 1–11 de `spec.md` verificados; DoD (Σ = operativos) cubierto por test.
- Docs y ADR 0011 publicados.
- `spec.md` → `**Estado:** implementado` (lo hace `/sdd-implement`).
