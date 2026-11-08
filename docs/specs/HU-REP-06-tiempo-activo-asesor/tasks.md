# HU-REP-06 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.

## Implementación — backend

- [x] `config/env.ts`: añadir `ACTIVITY_HEARTBEAT_MS` (60000) y `ACTIVITY_TOLERANCIA_MS` (30000) validadas con Zod (`IDLE_MS` es constante del frontend).
- [x] Crear `features/activity/activity.types.ts` (`IActividadAsesor`, `IActividadAsesorDocument`, `ITramoActividad`).
- [x] Crear `features/activity/activity.model.ts` (`tenantId` requerido + indexado, índice único `{ tenantId, userId, hora }`, índice de lectura `{ tenantId, hora, userId }`, TTL ~400 días, colección `actividad_asesores`; más `ActividadCursor` con índice único `{ tenantId, userId }`).
- [x] Crear `features/activity/activity.validation.ts` (`heartbeatSchema` con `body/params/query` vacíos).
- [x] Crear `features/activity/activity.service.ts`: `calcularCredito` y `repartirPorHora` (puras) + `registrarLatido` (usuario activo → cursor atómico `ActividadCursor` → upserts con `findOneAndUpdateScoped`).
- [x] Crear `features/activity/activity.controller.ts` (`heartbeatController` → 204, `tenantId`/`sub` del token).
- [x] Crear `features/activity/activity.routes.ts` (cadena canónica, `authorize(['admin'])`).
- [x] Montar en `app.ts`: `app.use('/api/activity', activityRoutes)` (después de `csrfGuard`).
- [x] `reports.types.ts`: `segundosActivos` en `IAdvisorRow` y `IAdvisorReportTotales`; `IAdvisorActivityResponse` y `Granularidad`.
- [x] `reports.validation.ts`: extraer la regla de `tz` a una constante compartida con `peakHoursQuerySchema`; añadir `advisorActivityQuerySchema`.
- [x] `reports.service.ts`: `sumarActividad` dentro del `Promise.all` de `getAdvisorReport` (y en `tieneCifras`); nueva `getAdvisorActivity` con `$dateTrunc` + relleno de periodos vacíos (función pura).
- [x] `reports.controller.ts` + `reports.routes.ts`: `GET /advisor-activity` con el gate `SUBROLES_REPORTES`.

## Implementación — frontend (invocar antes `emil-design-eng`, `impeccable:impeccable`, `frontend-design:frontend-design` y `dataviz`)

- [x] `features/activity/api.ts` (`enviarLatido` por `apiClient`) y `hooks/useActivityHeartbeat.ts`.
- [x] Montar `useActivityHeartbeat()` en `components/layout/AppLayout.tsx`.
- [x] `features/reports/types`: `segundosActivos` y la serie de actividad.
- [x] `lib/duracion-format.ts` (segundos → `h:mm` y forma larga).
- [x] `hooks/use-activity-params.ts` (`?granularidad=&asesor=`) y `hooks/useAdvisorActivity.ts` (clave bajo `ADVISOR_REPORT_KEY` para que `RefreshControl` la refresque).
- [x] `AdvisorKpiStrip`: `KpiCell` «Tiempo activo» (total + promedio por asesor).
- [x] `AdvisorTable`: columna ordenable «Tiempo activo».
- [x] `AdvisorActivityChart` nuevo (`ChartCard` + `Tabs` + `Select` + `chart.tsx`), estados de carga/vacío y aviso de «sin datos antes de …».
- [x] Integrar en `AdvisorReportPage.tsx`; revisar light y dark.

## Tests (Vitest)

- [x] `activity.service.test.ts`:
  - [x] primer latido → acredita un intervalo; latido a los 60 s → 60 s; hueco > tope → un intervalo (no el hueco).
  - [x] dos «pestañas» intercaladas cada 30 s durante 10 min → ≈ 600 s, no 1200.
  - [x] latido a las 10:00:20 con crédito de 60 s → 40 s en la cubeta de 09:00 y 20 s en la de 10:00.
  - [x] usuario `activo: false` → no escribe.
- [x] `activity.routes.test.ts`: 204 con sesión válida; 401 sin token; un `tenantId` en el body se ignora.
- [x] `activity.isolation.test.ts`: latidos de A no crean ni modifican cubetas ni cursores de B; el cursor es por tenant.
- [x] `reports.activity.service.test.ts`: agrupación día/semana(lunes)/mes con `tz` `America/Bogota`; relleno de periodos vacíos; filtro `asesorId`; `segundosActivos` en `by-advisor` y asesor con solo tiempo activo visible.
- [x] `reports.activity.routes.test.ts`: 400 por `granularidad`/`tz`/`asesorId` inválidos y rango > 366 días; 403 por subrol no autorizado.
- [x] `reports.activity.isolation.test.ts`: los segundos de A no aparecen en ningún reporte de B; un `asesorId` de A consultado desde B → serie vacía.
- [x] Front: `useActivityHeartbeat.test.tsx` (timers falsos: sin interacción no late; pestaña oculta no late; al volver a la pestaña el ciclo se reinicia; superadmin no late); `AdvisorReportPage.test.tsx` (KPI, columna, cambio de granularidad y asesor en la URL).

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde.
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.
- [ ] Verificación visual light/dark (capturas en `.playwright-mcp/`, borradas al terminar; `git status` sin `*.png`). _Pendiente: no hay MongoDB local para levantar la app con datos; queda para la revisión manual._
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [x] `docs/data-model.md` y `docs/domain.md` actualizados.

## Definición de "hecho"

Cada asesor late mientras trabaja con la pestaña visible, el servidor acredita su tiempo sin doble
conteo entre pestañas, y «Productividad por asesor» muestra el tiempo activo en KPI, tabla y una
gráfica por día/semana/mes filtrable por asesor, todo aislado por tenant.
