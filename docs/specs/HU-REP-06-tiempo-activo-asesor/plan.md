# HU-REP-06 — Plan técnico (CÓMO)

## Archivos a crear / tocar

```
apps/backend/src/
├── config/env.ts                                  # + ACTIVITY_HEARTBEAT_MS, ACTIVITY_TOLERANCIA_MS
├── features/activity/                             # NUEVO feature (6 archivos)
│   ├── activity.types.ts                          # IActividadAsesor, constantes, DTOs
│   ├── activity.model.ts                          # ActividadAsesor (actividad_asesores) + ActividadCursor (actividad_cursores)
│   ├── activity.validation.ts                     # heartbeatSchema (body/params/query vacíos)
│   ├── activity.service.ts                        # registrarLatido, calcularCredito (pura), repartirPorHora (pura)
│   ├── activity.controller.ts                     # heartbeatController
│   ├── activity.routes.ts                         # POST /heartbeat
│   ├── activity.service.test.ts                   # crédito, huecos, multi-pestaña, cruce de hora
│   ├── activity.routes.test.ts                    # 204, 401, usuario inactivo
│   └── activity.isolation.test.ts                 # aislamiento
├── features/reports/
│   ├── reports.types.ts                           # + segundosActivos en IAdvisorRow/totales; tipos de la serie
│   ├── reports.validation.ts                      # + advisorActivityQuerySchema
│   ├── reports.service.ts                         # + sumarActividad() en getAdvisorReport; + getAdvisorActivity()
│   ├── reports.controller.ts                      # + getAdvisorActivityController
│   ├── reports.routes.ts                          # + GET /advisor-activity
│   ├── reports.activity.service.test.ts           # NUEVO
│   ├── reports.activity.routes.test.ts            # NUEVO
│   └── reports.activity.isolation.test.ts         # NUEVO
└── app.ts                                         # app.use('/api/activity', activityRoutes)

apps/frontend/src/
├── features/activity/
│   ├── api.ts                                     # enviarLatido() vía apiClient
│   └── hooks/useActivityHeartbeat.ts (+ .test.tsx)
├── components/layout/AppLayout.tsx                # monta useActivityHeartbeat()
└── features/reports/
    ├── types/{api,domain}.ts                      # + segundosActivos, serie de actividad
    ├── hooks/useAdvisorActivity.ts                # TanStack Query, clave bajo ADVISOR_REPORT_KEY (refresco común)
    ├── hooks/use-activity-params.ts               # ?granularidad=&asesor= en la URL
    ├── lib/duracion-format.ts                     # segundos → "h:mm" / "12 h 30 min"
    ├── components/AdvisorKpiStrip.tsx             # + KpiCell "Tiempo activo"
    ├── components/AdvisorTable.tsx                # + columna ordenable
    ├── components/AdvisorActivityChart.tsx        # NUEVO (ChartCard + Tabs + Select + chart.tsx)
    └── pages/AdvisorReportPage.tsx (+ .test.tsx)  # integra la gráfica y el aviso de "sin datos previos"
```

## Contratos

### `activity.types.ts`
```ts
export interface IActividadAsesor {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Inicio de la hora UTC (minutos/segundos/ms a 0). */
  hora: Date;
  segundosActivos: number;
  primerLatido: Date;
  ultimoLatido: Date;
}
export interface IActividadAsesorDocument extends IActividadAsesor, Document {}
/** Tramo acreditado por un latido, ya partido por hora UTC. */
export interface ITramoActividad { hora: Date; segundos: number }
```

### `activity.model.ts`
- `tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true }`, `userId` requerido.
- Índices: `{ tenantId: 1, userId: 1, hora: 1 }` **único** (upsert sin duplicados) y
  `{ tenantId: 1, hora: 1, userId: 1 }` (lectura de reportes).
- TTL `{ hora: 1 }`, `expireAfterSeconds` ≈ 400 días.
- `collection: 'actividad_asesores'`, `timestamps: false`.

### `activity.service.ts`
```ts
/** Pura: cuánto acreditar a un latido dado el último aceptado. */
export function calcularCredito(ultimoMs: number | null, ahoraMs: number, cfg: { intervaloMs; toleranciaMs }): number;
/** Pura: reparte [ahora - credito, ahora] en tramos por hora UTC. */
export function repartirPorHora(ahora: Date, creditoMs: number): ITramoActividad[];
export async function registrarLatido(tenantId: string, userId: string, ahora?: Date): Promise<void>;
```
`registrarLatido`:
1. Verifica que el usuario exista y esté `activo` (`findByIdScoped(User, tenantId, userId)`); si no, sale.
2. Cursor: `findOneAndUpdateScoped(ActividadCursor, tenantId, { userId }, { $max: { ultimoLatido:
   ahora } }, { upsert: true, new: false })` → `ultimoMs` previo. Es el punto atómico que serializa
   pestañas paralelas. La carrera del primer upsert la resuelve el índice único con un reintento.
   *(Implementación: se eligió Mongo en vez del `GETSET` de Redis previsto al planear, porque la
   suite de tests no levanta Redis y así el crédito se prueba de punta a punta.)*
3. `calcularCredito` → si es 0, sale.
4. Por cada tramo: `findOneAndUpdateScoped(ActividadAsesor, tenantId, { userId, hora }, { $inc:
   { segundosActivos }, $min: { primerLatido }, $max: { ultimoLatido } }, { upsert: true })`.

Regla de crédito: `ultimo === null || Δ > intervalo + tolerancia` → `intervalo` (el latido afirma
«estuve activo el último intervalo»); si no → `Δ`. `Δ ≤ 0` → 0.

### `activity.routes.ts`
```ts
router.post('/heartbeat', authenticateJWT, requireTenant, authorize(['admin']),
  validate(heartbeatSchema), asyncHandler(heartbeatController));
```
`csrfGuard` ya es global en `app.ts:71`. El controller: `registrarLatido(req.user!.tenantId!.toString(), req.user!.sub)` → `204`.

### Reportes
- `IAdvisorRow.segundosActivos: number`; `IAdvisorReportTotales.segundosActivos: number`.
- `sumarActividad(tenantOid, rango)` → `aggregateScoped(ActividadAsesor, …, [{ $match: { hora:
  { $gte, $lte } } }, { $group: { _id: '$userId', n: { $sum: '$segundosActivos' } } }])` → `toMap`.
  Se añade al `Promise.all` de `getAdvisorReport` y entra en `tieneCifras`.
- Validación:
```ts
export const advisorActivityQuerySchema = z.object({ query: conReglasDeRango(rangoQueryBase.extend({
  tz: zonaQuery,                                   // misma regla que peakHoursQuerySchema (extraer a const)
  granularidad: z.enum(['dia', 'semana', 'mes']).default('dia'),
  asesorId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
})) });
```
- Respuesta:
```ts
export interface IAdvisorActivityResponse {
  generadoAt: string; rango: { desde: string; hasta: string };
  granularidad: 'dia' | 'semana' | 'mes'; tz: string;
  asesores: Array<{ asesorId: string; nombre: string }>;
  periodos: Array<{ periodo: string /* YYYY-MM-DD de inicio */; totalSegundos: number;
    porAsesor: Array<{ asesorId: string; segundos: number }> }>;
}
```
- Agregación: `$match { hora rango, userId? }` → `$group { _id: { p: { $dateTrunc: { date: '$hora',
  unit: day|week|month, timezone: tz, startOfWeek: 'monday' } }, u: '$userId' }, s: { $sum } }` →
  `$sort`. Los periodos sin datos se rellenan con 0 en el service (función pura) para que la gráfica
  no tenga huecos.
- Ruta: `GET /advisor-activity` con el mismo gate que `/by-advisor` (`authorizeSubrol(SUBROLES_REPORTES)`).

### Frontend
- `useActivityHeartbeat()`: un `setInterval(ACTIVITY_HEARTBEAT_MS)` que solo llama a
  `enviarLatido()` si `visible && ahora - ultimaInteraccion < IDLE_MS`; listeners pasivos
  (`pointerdown`, `keydown`, `scroll`, `wheel`, `touchstart`, `focus`) y `visibilitychange` (latido
  inmediato al volver si hubo interacción). Limpieza al desmontar; errores silenciosos (un 401 lo
  maneja el `apiClient`). Constantes espejo del backend en `features/activity`.
- `AdvisorActivityChart`: `ChartCard` + `Tabs` (Día/Semana/Mes) + `Select` («Todos los asesores» o
  uno); barras apiladas por asesor con `components/ui/chart.tsx` (Recharts) o una sola serie si hay
  asesor seleccionado. Estados de carga con `Skeleton`, vacío con el aviso de «sin datos antes de …».
- Ejes y tooltips en `h:mm`; skills `emil-design-eng`, `impeccable:impeccable`,
  `frontend-design:frontend-design` y `dataviz` antes de escribir los componentes.

## Notas

- **Por qué cubetas horarias y no segmentos inicio/fin:** se reagrupan por día/semana/mes en
  cualquier zona con `$dateTrunc` sin partir segmentos en la medianoche local. Error conocido en
  zonas con desfase de media hora (+5:30): aceptable y documentado.
- **Por qué REST y no evento de socket:** respeta la cadena canónica de middlewares, se testea con
  supertest igual que el resto y no inventa un patrón de handlers en `socket.gateway.ts`. Coste:
  1 req/min por pestaña activa.
- **Filtro por asesor en el cliente:** la página pide siempre la serie completa y la gráfica oculta a
  los demás asesores. Así el color sigue al asesor (no se repinta al filtrar). El parámetro
  `asesorId` del endpoint queda disponible para otros consumidores (móvil, exportaciones).
- Volumen: ~10 documentos por asesor por día, 1 upsert por latido. Sin impacto en el reporte
  principal: la nueva agregación usa el índice `{ tenantId, hora, userId }`.
- `getAdvisorReport` sigue con rango en medianoches UTC (HU-REP-01); la serie usa `tz` como HU-REP-04.
  El KPI y la columna pueden diferir en minutos de la suma de la gráfica en los bordes del rango:
  se acepta y se documenta en un tooltip.
- Actualizar `docs/data-model.md` (colección `actividad_asesores`) y `docs/domain.md`
  (§ Productividad por asesor → «tiempo activo»).

## Verificación

- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` · tests de Vitest del front.
- Manual: dos pestañas abiertas 10 min → el reporte muestra ≈ 10 min; ocultar la pestaña detiene el
  conteo; captura visual light/dark en `.playwright-mcp/` (borrar al terminar).
