# HU-REP-04 — Horas pico de mensajería (spec ligero)

> SDD camino ligero: el QUÉ, el CÓMO mínimo y las tasks en un solo archivo, sin `plan.md` ni
> `tasks.md`. Cuarto reporte **de tenant**: un agregado temporal sobre `messages`, sin IA, sin
> backfill y sin colección nueva. Reutiliza el slice `reports/` y el gate de HU-REP-01/02/03
> (ADR 0011).

**Estado:** implementado

## Historia

> Como **gerente** quiero ver las horas pico o de mayor demanda de mensajería (dashboard).
> Visualizar la distribución horaria de la mensajería para dimensionar la operación.

## Objetivo

Servir con `GET /api/reports/peak-hours` la distribución del volumen de mensajes por **hora del
día** y por **día** del periodo, y pintarla en `/reports/peak-hours`.

**Definition of Done:** la gráfica muestra correctamente los picos de volumen del periodo. Es
decir, cada bucket coincide con el conteo de mensajes del periodo calculado aparte en el test, y
la hora pico señalada es la de mayor volumen de entrantes.

## Alcance

**Incluye:**
- Endpoint `GET /api/reports/peak-hours?desde&hasta&tz` en el router existente. Sin montaje nuevo
  en `app.ts`.
- Un índice `{ tenantId: 1, createdAt: 1 }` en `messages` (ver D6).
- La página `/reports/peak-hours` con:
  - KPI strip;
  - una gráfica de líneas por hora del día;
  - una gráfica de líneas por día.
- Docs: `domain.md`, `data-model.md` (el índice), `api-contract.md` y la enmienda al ADR 0011.

**Fuera de alcance:**
- Zona horaria configurable por tenant (D1, opción c).
- Mapa de calor día de la semana × hora.
- Comparativa contra el periodo anterior.
- Desglose por asesor o por canal.
- Export y tiempo real.

## Decisiones

### D1 — Zona horaria: la del visor, por query (`?tz=`), con UTC por defecto
- **Se elige la opción (b).** El navegador envía su zona IANA
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`, p. ej. `America/Bogota`).
  - El backend la aplica al agrupar (`$hour` y `$dateToString` con `timezone`) **y** a los
    límites del periodo (ver D2).
  - Sin `tz`, usa `UTC`, igual que `admin-metrics.service.ts`.
  - La respuesta devuelve el `timezone` usado, y el frontend no recalcula nada.
- **Validación:** el valor debe ser un nombre IANA que `Intl` conozca, o `UTC`.
  - Comprobación: `Intl.supportedValuesOf('timeZone')` más `UTC` explícito.
  - Máximo 64 caracteres. Cualquier otro valor → `400`.
- **No se aceptan offsets** (`-05:00`): con horario de verano el offset no es constante en un
  periodo de 30 días, y el pico se correría una hora en parte del rango.
- **Por qué no (a), UTC fijo:** para un operador en GMT-5 el pico de las 10:00 saldría a las 15:00.
  Es el dato que la historia pide interpretar, así que se vería mal justo donde importa.
- **Por qué no (c), zona por tenant:** es un campo nuevo en `Tenant`, con su UI y su migración.
  Además casi siempre coincide con la del gerente que mira el reporte. Si un tenant opera en varias
  zonas, (c) es la evolución natural: el contrato `?tz=` sigue sirviendo.
- **Reconciliación con (a):** `tz=UTC` reproduce exactamente el criterio de `admin-metrics`, y los
  instantes guardados no cambian (`createdAt` sigue en UTC). La zona es **solo una lente de
  lectura**.

### D2 — Periodo en días calendario de esa zona
- `desde`/`hasta` siguen siendo días `YYYY-MM-DD`, resueltos con `resolverRango`: default 30 días,
  máximo 366, `hasta >= desde`.
- Se interpretan como días **en `tz`**: el 1 de septiembre en Bogotá va de 05:00Z a 05:00Z del día
  siguiente.
- **Mecánica, sin aritmética de zonas en JS:**
  1. Un `$match` por `createdAt` en una ventana UTC ensanchada ±14 h, que usa el índice.
  2. Se calcula el día local con `$dateToString { format: '%Y-%m-%d', timezone }`.
  3. Se filtra por día local `∈ [desde, hasta]`.

  14 h es el mayor desfase IANA, así que ningún día local queda cortado.
- Sin este paso, `porDia` tendría un primer y un último día incompletos. Además el pico horario
  heredaría unas horas del día anterior.
- `rango` se devuelve como en los otros reportes: ISO a medianoche y a fin de día. Ahí representa
  **días calendario** de `timezone`.

### D3 — Qué es "demanda": los mensajes entrantes
- **Volumen de un bucket:** mensajes del tenant con `createdAt` en el bucket, de clientes que
  existen y no son demo. Se cuentan por separado:
  - **entrantes:** `direccion: 'inbound'`, lo que escriben los clientes;
  - **salientes:** `outbound`, respuestas del bot y de los asesores, y envíos de plantilla.
- **El pico se calcula sobre los entrantes, no sobre el total.** Es una desviación deliberada de la
  sugerencia de "total como serie principal":
  - una campaña (HU-MARK-01) persiste un `Message` `outbound` de `tipo: 'plantilla'` por
    destinatario;
  - un lanzamiento de 2.000 envíos a las 09:00 convertiría esa hora en el "pico". Eso es trabajo
    que la empresa genera, no demanda que tenga que atender.
- El total sigue disponible por bucket (`total = entrantes + salientes`). La gráfica muestra
  entrantes y salientes como dos líneas de la misma unidad, en un único eje Y.
- **Hora pico:** la de más entrantes. En caso de empate gana la más temprana; con 0 entrantes es
  `null`. El **día pico** sigue la misma regla.

### D4 — Eje X: hora del día (principal) y día (secundaria)
- **Por hora del día:** 24 buckets, 0..23, sumando todo el periodo. Es lo que revela la hora pico,
  y siempre trae las 24 horas, incluidas las vacías en 0.
- **Por día:** un bucket por día calendario del periodo en `tz`, completos y con los vacíos en 0.
  Sirve para ver si el volumen crece o se concentra en ciertos días.
  - Máximo 366 puntos.
  - No trae detalle horario por día: el hover muestra el total del día y su desglose.
- Ambos salen de **una sola agregación** agrupada por `{ dia, hora }`. El servicio pliega el
  resultado en las dos series y rellena los huecos.

### D5 — Exclusión de demo y de huérfanos
- Igual que en HU-REP-01/02/03: se excluyen los clientes demo (`PREFIJO_CLIENTE_DEMO` sobre
  `metaUserId`) y los mensajes cuyo cliente ya no existe en el tenant.
- Se hace con `lookupScoped`, que repite `tenantId` en `$expr`.
- **El lookup va después de un primer `$group` por `{ clienteId, dia, hora }`,** no por mensaje.
  Así el número de lookups lo acotan los pares cliente-hora, no el volumen de mensajes.
- Sin esta exclusión, `seed-inbox-demo.ts` dibuja picos falsos.

### D6 — Índice `{ tenantId: 1, createdAt: 1 }` en `messages`
- Los índices actuales no sirven para un rango de fechas sin otro filtro:
  - `{ tenantId, clienteId, createdAt }` exige `clienteId`;
  - `{ tenantId, tipo, createdAt }` exige `tipo`.
- Sin índice dedicado, cada consulta recorre todos los mensajes del tenant.
- El índice también acelera los `$match` por `createdAt` que ya hacen HU-REP-01/02/03.
- **Coste:** una entrada más por escritura en una colección de mucho tráfico. Es aceptable porque la
  sirven cuatro reportes.
- Precedente: el índice `{ tenantId, accion, createdAt }` que HU-REP-01 añadió a `audit_events`.

### D7 — Dashboard: página propia
`/reports/peak-hours` ("Horas pico") en el grupo **Reportes**, con el mismo gate que el resto.

## Contrato del endpoint

`GET /api/reports/peak-hours`

| Query | Tipo | Default | Notas |
|---|---|---|---|
| `desde` | fecha `YYYY-MM-DD` | hoy − 29 días | Día calendario en `tz`, inclusivo. |
| `hasta` | fecha `YYYY-MM-DD` | hoy | Ídem. Máx. 366 días de rango. |
| `tz` | zona IANA | `UTC` | `America/Bogota`, `Europe/Madrid`… Sin offsets. |

**200:**

```jsonc
{
  "generadoAt": "2026-10-09T15:00:00.000Z",
  "rango": { "desde": "2026-09-10T00:00:00.000Z", "hasta": "2026-10-09T23:59:59.999Z" },
  "timezone": "America/Bogota",
  "totales": { "mensajes": 5210, "entrantes": 2480, "salientes": 2730 },
  "porHora": [ { "hora": 0, "total": 12, "entrantes": 9, "salientes": 3 } /* … 24 filas, 0..23 */ ],
  "porDia": [ { "fecha": "2026-09-10", "total": 160, "entrantes": 80, "salientes": 80 } /* … */ ],
  "pico": { "hora": 10, "entrantes": 310 },          // null sin entrantes
  "diaPico": { "fecha": "2026-09-22", "entrantes": 140 } // null sin entrantes
}
```

**Invariantes:**
- Σ `porHora.total` = Σ `porDia.total` = `totales.mensajes`.
- `total = entrantes + salientes` en cada fila.

La respuesta solo lleva conteos y fechas: **sin** clientes, teléfonos ni textos.

**Errores:**
- `401` sin JWT.
- `403` para `coordinator`/`secretary`.
- `500` para el superadmin: lo corta `requireTenant`.
- `400` con rango inválido o `tz` desconocida.

## Diseño de la UI

`/reports/peak-hours` es visible para admin sin subrol, director y manager.
1. **Cabecera:**
   - el título y el `PeriodFilter`, sincronizado con la URL;
   - debajo, el rango legible y la línea «Horas en tu zona: America/Bogota», que sale de
     `timezone` en la respuesta.
2. **KPI strip** (mismo lenguaje que HU-REP-02/03):
   - **Hora pico**, la celda con acento: «10:00–11:00», con sus entrantes y su porcentaje del total
     de entrantes;
   - Mensajes recibidos;
   - Día de más demanda;
   - Promedio diario de recibidos.
3. **Por hora del día:** `LineChart` de 24 puntos.
   - Dos series en un eje: Recibidos (`--chart-1`) y Enviados (`--chart-2`).
   - Leyenda presente, porque son dos series.
   - El punto de la hora pico va marcado con un dot y un rótulo directo con su valor.
   - Tooltip por hora con «10:00–11:00», recibidos y enviados.
   - **Por qué líneas y no barras:** las 24 horas son un ciclo continuo, y la forma de la curva (la
     subida de la mañana, el valle del mediodía) es la información.
4. **Por día:** `LineChart` con las mismas dos series, el día pico marcado y un tooltip con la fecha.
5. **Estados:**
   - skeleton mientras carga;
   - vacío sin mensajes en el periodo;
   - error con reintento.

Light y dark. Página con `lazy()`.

## Criterios de aceptación

1. **Serie completa:**
   - `porHora` trae siempre las 24 horas, y `porDia` todos los días del rango, con los vacíos en 0;
   - `pico` y `diaPico` identifican el bucket de más entrantes (empate: el primero; sin datos:
     `null`);
   - se cumplen los invariantes de suma del contrato.
2. **DoD:** con datos sembrados en varias horas y días, cada bucket coincide con el conteo calculado
   aparte en el test. No cuentan:
   - los mensajes fuera de rango;
   - los de hilos demo;
   - los de clientes inexistentes.
3. **Zona horaria:**
   - con `tz=America/Bogota`, un mensaje de las `2026-09-01T03:30Z` cuenta en la hora 22 del día
     `2026-08-31`, y queda **fuera** de un rango que empieza el `2026-09-01`;
   - sin `tz`, la respuesta dice `timezone: 'UTC'`;
   - `tz` inválida u offset → `400`.
4. **Endpoint:**
   - usa la cadena `authenticateJWT → requireTenant → authorize(['admin']) →
     authorizeSubrol(SUBROLES_REPORTES) → validate → asyncHandler`;
   - responde 401/403/500/200/400 según el contrato;
   - sin query, el rango es de 30 días con `timezone: 'UTC'`.
5. **Frontend:**
   - visible para admin sin subrol, director y manager; para el resto, el ítem está oculto y la URL
     redirige;
   - el periodo va sincronizado con la URL y la `tz` del navegador viaja al endpoint;
   - la hora pico aparece destacada;
   - estados de carga, vacío y error;
   - light y dark, con shadcn/ui y las skills de diseño invocadas antes de cada componente.
6. Docs actualizados: `domain.md`, `data-model.md`, `api-contract.md` y la enmienda al ADR 0011.
7. **Aislamiento multi-tenant:**
   - `aggregateScoped` sobre `Message` con el `tenantId` del token, y el `$lookup` repite el
     `tenantId`;
   - los mensajes de otro tenant, aunque apunten a un cliente de A, no alteran ningún bucket;
   - `?tenantId=` se ignora;
   - la respuesta no lleva PII.
8. `tsc --noEmit`, los tests del backend y `pnpm --filter @sofiapp/web build && lint` en verde.

## Archivos

### Backend (`apps/backend/src/`)
- `features/message/message.model.ts` — índice `{ tenantId: 1, createdAt: 1 }` (D6).
- `features/reports/reports.types.ts`:
  - `IPeakHourRow`, `IPeakDayRow`, `IPeakHoursResponse`;
  - `TZ_DEFAULT = 'UTC'` y `DESFASE_MAX_MS = 14 h`.
- `features/reports/reports.validation.ts` — `peakHoursQuerySchema`: las reglas de rango comunes
  (`conReglasDeRango`) más `tz`.
- `features/reports/reports.service.ts` — `getPeakHours(tenantId, q, now)`:
  - la agregación de D2–D5;
  - el relleno de las 24 horas y de los días;
  - el cálculo de `pico` y `diaPico`.
- `features/reports/reports.controller.ts` y `reports.routes.ts` — `GET /peak-hours`.
- `features/reports/reports.fixtures.ts` — `crearMensaje` ya acepta `createdAt` y `sender`. Si hace
  falta, se le añade `direccion` explícita para los casos de plantilla.
- **Tests** (suites por endpoint, como `reports.handoff.*` y `reports.top-products.*`):
  - `reports.peak-hours.service.test.ts`;
  - `reports.peak-hours.routes.test.ts`;
  - `reports.peak-hours.isolation.test.ts`.

**Pipeline** (`aggregateScoped(Message, tenantOid, …)`):

| Paso | Etapa |
|---|---|
| 1 | `$match { createdAt: { $gte: desdeUtc − 14h, $lte: hastaUtc + 14h } }` |
| 2 | `$addFields { dia: $dateToString{ '%Y-%m-%d', timezone: tz }, hora: $hour{ date, timezone: tz } }` |
| 3 | `$match { dia: { $gte: 'YYYY-MM-DD desde', $lte: 'YYYY-MM-DD hasta' } }` |
| 4 | `$group { _id: { c: '$clienteId', dia, hora }, entrantes: Σ inbound, salientes: Σ outbound }` |
| 5 | `lookupScoped(clientes, tenantOid, '$_id.c', { metaUserId: 1 }, 'c')` → `$unwind` → `$match` no demo |
| 6 | `$group { _id: { dia, hora }, entrantes: Σ, salientes: Σ }` |

### Frontend (`apps/frontend/src/`)
- `api/reports.ts` — `getPeakHours`.
- `features/reports/`:
  - `types/{domain,api,index}.ts`: `PeakHours`, `PeakHoursParams` (rango + `tz`);
  - `hooks/usePeakHours.ts`: queryKey `['reports','peak-hours', params]`, `keepPreviousData`,
    `staleTime: 60_000`. Sigue el nombre en camelCase de `useHandoffRate.ts`.
  - `components/{PeakHoursKpiStrip,PeakHoursByHourChart,PeakHoursByDayChart}.tsx`;
  - `pages/{PeakHoursPage.tsx, PeakHoursPage.test.tsx}`.
- `components/layout/nav-config.ts` — ítem «Horas pico» en Reportes, con
  `subroles: SUBROLES_REPORTES`.
- `router.tsx` — ruta lazy `/reports/peak-hours` con `RequireRole` + `RequireReportes`.

### Docs
- `docs/domain.md` — sección «Horas pico de mensajería»: demanda = entrantes, zona del visor y días
  calendario en esa zona.
- `docs/data-model.md` — el índice nuevo de `messages`.
- `docs/api-contract.md` — `GET /api/reports/peak-hours`.
- `docs/adr/0011-reportes-por-subrol.md` — enmienda HU-REP-04: el mismo gate.

## Tasks (ejecutar con /sdd-implement)

### 0. Rama
- [x] Trabajar sobre `feat/HU-REP-01`, sin rama nueva, sin checkout y sin push. HU-REP-03 ya está
      commiteada (`327ecee`).

### Backend
- [x] 1. `message.model.ts`: índice `{ tenantId: 1, createdAt: 1 }`, con un comentario que explique
      a qué reportes sirve.
- [x] 2. `reports.types.ts`: `IPeakHourRow`, `IPeakDayRow`, `IPeakHoursResponse`, `TZ_DEFAULT` y
      `DESFASE_MAX_MS`.
- [x] 3. `reports.validation.ts`: `peakHoursQuerySchema` con `tz` validada contra
      `Intl.supportedValuesOf('timeZone')` ∪ `{ 'UTC' }`, máximo 64 caracteres, default `UTC`.
- [x] 4. `reports.service.ts`: `getPeakHours`:
  - agregación (D2–D5);
  - lista de días del rango y relleno con ceros;
  - `pico`/`diaPico` (empate → el primero; 0 → `null`);
  - `totales`.
- [x] 5. Controller + `GET /peak-hours` con `authorizeSubrol(SUBROLES_REPORTES)`. Sin montaje nuevo.

### Tests (backend)
- [x] 6. `reports.peak-hours.service.test.ts`:
  - **DoD:** buckets iguales al conteo calculado aparte;
  - 24 horas y todos los días presentes, con huecos en 0;
  - invariantes de suma y `total = entrantes + salientes`;
  - pico y día pico, con empate y sin datos;
  - fuera de rango, demo y huérfanos no cuentan;
  - **zona:** el mensaje de las 03:30Z con `America/Bogota` va a la hora 22 del día anterior y
    queda fuera del rango; con `UTC`, a la hora 3;
  - una ráfaga de plantillas salientes no mueve el pico.
- [x] 7. `reports.peak-hours.routes.test.ts`:
  - 401 · 500 superadmin · 403 coordinator/secretary · 200 admin/director/manager (forma del
    contrato);
  - sin query → 30 días y `timezone: 'UTC'`;
  - 400 con rango inválido, `tz=Mars/Base`, `tz=-05:00` y `tz` de más de 64 caracteres.
- [x] 8. `reports.peak-hours.isolation.test.ts`:
  - los mensajes de B, incluidos los que apuntan a un cliente de A, no suman en A;
  - `?tenantId=` se ignora;
  - sin PII (teléfonos, nombres, textos, `metaUserId`).
- [x] 9. Regresión: suites de `reports` (REP-01/02/03) y `message`.

### Docs
- [x] 10. `domain.md`, `data-model.md`, `api-contract.md` y la enmienda al ADR 0011.

### Frontend
> Antes de cada componente: `emil-design-eng`, `impeccable:impeccable` y
> `frontend-design:frontend-design` (+ `dataviz`). Las que no estén instaladas se anotan. shadcn/ui;
> light y dark.
- [x] 11. `api/reports.ts` `getPeakHours`; tipos; `usePeakHours`. La `tz` sale de
      `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- [x] 12. `PeakHoursKpiStrip`, `PeakHoursByHourChart` (pico marcado), `PeakHoursByDayChart` y
      `PeakHoursPage`:
  - periodo en la URL;
  - línea de zona horaria;
  - vacío y error con reintento.
- [x] 13. Ruta lazy `/reports/peak-hours` (`RequireRole` + `RequireReportes`) e ítem en «Reportes».
- [x] 14. `PeakHoursPage.test.tsx`:
  - pinta los KPIs y la hora pico con la API mockeada;
  - el rango de la URL y la `tz` llegan al endpoint;
  - vacío;
  - error → reintentar.

### Verificación final
- [x] `pnpm --filter @sofiapp/api typecheck`
- [x] `pnpm --filter @sofiapp/api test` (nuevos + regresión + aislamiento)
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` + test de página
- [x] Checklist PR de `docs/multi-tenancy.md` §9:
  - todo por `*Scoped`;
  - `tenantId` del token;
  - `$lookup` con `tenantId`;
  - tests de aislamiento presentes.
- [ ] Manual: *(pendiente: requiere datos reales y navegador)*
  - ver el dashboard en light y dark;
  - cambiar de periodo;
  - comprobar que un coordinator no ve el reporte;
  - capturas en `.playwright-mcp/`, borradas al terminar.
- [ ] `git status` sin `*.png`. Commits separados:
  - `feat(api): add peak hours report endpoint`
  - `feat(web): add peak hours dashboard`
  - `docs(docs): document peak hours report`

> **Nota de implementación.** Skills invocadas antes de los componentes: `frontend-design` y
> `dataviz`; `emil-design-eng` e `impeccable:impeccable` no están instaladas en el entorno.
> El pico se marca con `ReferenceDot` + rótulo directo; las dos gráficas comparten
> `VolumeLineChart`.

## Dependencias

- HU-REP-01/02/03: slice `reports/`, `conReglasDeRango`, `resolverRango`, `lookupScoped`,
  `PREFIJO_CLIENTE_DEMO`, `SUBROLES_REPORTES`, piezas de dashboard (`PeriodFilter`, `ChartCard`,
  franjas KPI) y ADR 0011.
- HU-OMNI-05 (exclusión demo) · HU-MARK-01 (mensajes de plantilla que motivan D3).
