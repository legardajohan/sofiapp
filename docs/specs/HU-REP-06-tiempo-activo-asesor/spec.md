# HU-REP-06 — Tiempo activo del asesor en «Productividad por asesor» (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Extiende el reporte de HU-REP-01 con una métrica que hoy no se puede calcular:
> el repo no registra ninguna señal de actividad del asesor (el login no deja rastro, el logout solo
> borra cookies, el socket no maneja `disconnect`, `User` no tiene último acceso y `Message` no
> guarda autor). La métrica nace con este feature y **no tiene historia previa**.

**Estado:** creado

## Objetivo

Medir cuánto tiempo cada asesor estuvo **activo** en SofiApp y mostrarlo en el tablero
«Productividad por asesor» (`/reports/advisors`), con desglose por día, semana o mes, combinable con
el filtro de periodo existente y con un filtro nuevo por asesor.

### Definición de «activo»

Un asesor está activo durante un minuto si, en ese minuto, **su pestaña de SofiApp estaba visible**
(`document.visibilityState === 'visible'`) **y** hubo interacción (teclado, clic, scroll, toque o
foco de ventana) en los últimos `IDLE_MS` (5 min, constante del frontend).

- Mientras se cumpla, el navegador emite un **latido cada 60 s** (`ACTIVITY_HEARTBEAT_MS`). Cada
  latido afirma «estuve activo el último intervalo», así que nunca se late por adelantado: al volver
  a la pestaña el ciclo se reinicia y el primer latido sale un intervalo después (latir en el acto
  acreditaría el minuto en que la pestaña estuvo oculta).
- El servidor acredita cada latido con **su propio reloj**: `min(Δ desde el último latido aceptado
  de ese usuario, intervalo + tolerancia)`. Nunca usa un timestamp enviado por el cliente.
- Varias pestañas del mismo asesor **no suman**: el crédito es por usuario.
- Pestaña en segundo plano, equipo suspendido o navegador cerrado → no hay latidos → se deja de
  contar en ≤ 1 intervalo.

## Alcance

Incluye:
- Feature backend `activity/` (6 archivos) con el modelo de cubetas horarias `ActividadAsesor` y el
  endpoint `POST /api/activity/heartbeat`.
- Campo `segundosActivos` en cada fila y en los totales de `GET /api/reports/by-advisor`.
- Endpoint nuevo `GET /api/reports/advisor-activity` con `granularidad = dia | semana | mes`, `tz`
  IANA y `asesorId` opcional.
- Hook de frontend `useActivityHeartbeat`, montado una vez por sesión en `AppLayout`.
- En `AdvisorReportPage`: KPI «Tiempo activo», columna en la tabla y gráfica nueva por periodo con
  selector de granularidad y de asesor, persistidos en la URL.
- Aviso en la UI de que no hay datos anteriores a la fecha de despliegue.

Fuera de alcance:
- «Tiempo conectado» (sesión abierta sin interacción) → posible feature posterior.
- Umbral de inactividad configurable por tenant desde la UI (queda en env).
- Latidos desde la app móvil (Fase 4). El contrato del endpoint ya sirve para ella.
- Backfill histórico: no hay de dónde reconstruirlo.
- Atribuir mensajes a un asesor concreto en `Message` (sigue el criterio de HU-REP-01).

## Criterios de aceptación

1. Existe el modelo `ActividadAsesor` con `tenantId` requerido e indexado, una cubeta por
   `{ tenantId, userId, hora }` (hora UTC truncada), índice único sobre esa terna e índice de
   lectura `{ tenantId: 1, hora: 1, userId: 1 }`.
2. `POST /api/activity/heartbeat` pasa por la cadena canónica (`authenticateJWT → requireTenant →
   authorize(['admin']) → validate → asyncHandler`) y por `csrfGuard`, toma `tenantId` y `userId`
   **solo** del token y responde `204`.
3. El primer latido tras un hueco acredita exactamente un intervalo; latidos consecutivos acreditan
   `Δ` medido por el servidor, con tope `intervalo + tolerancia`. Un hueco mayor que el tope no se
   acredita.
4. Dos pestañas del mismo asesor que laten en paralelo durante 10 min acreditan ≈ 10 min, no 20
   (tolerancia ± 1 intervalo).
5. Un latido de un usuario desactivado (`activo: false`) se ignora (204 sin escritura) y un JWT
   vencido devuelve 401.
6. Un latido que cruza el cambio de hora UTC reparte su crédito entre las dos cubetas.
7. `GET /api/reports/by-advisor` incluye `segundosActivos` por asesor y en `totales`, calculado
   sobre el mismo rango que el resto de cifras. Un asesor con solo tiempo activo (sin atendidas ni
   ventas) aparece en el reporte.
8. `GET /api/reports/advisor-activity` devuelve, para el rango, una serie ordenada de periodos
   (`dia`, `semana` ISO con inicio en lunes, `mes`) en la zona `tz`, con los segundos por asesor y
   el total por periodo. Con `asesorId` solo devuelve a ese asesor; un `asesorId` de otro tenant da
   una serie vacía, nunca datos ajenos. Usa las mismas reglas de rango que el resto de reportes
   (máx. 366 días) y el mismo gate de subrol (ADR 0011).
9. El frontend solo emite latidos con la pestaña visible y con interacción en los últimos
   `IDLE_MS`; deja de emitir al ocultarse la pestaña o al hacer logout, y el superadmin no late.
10. `AdvisorReportPage` muestra el KPI «Tiempo activo» (total y promedio por asesor), una columna
    ordenable «Tiempo activo» en formato `h:mm` y la gráfica `AdvisorActivityChart` con
    Día/Semana/Mes y selector de asesor. Granularidad y asesor viven en la URL
    (`?granularidad=&asesor=`) y se combinan con `?periodo=`. Todo prolijo en light y dark con los
    tokens semánticos, usando componentes shadcn/ui existentes.
11. **Aislamiento multi-tenant:** los latidos de un asesor del tenant A nunca aparecen en ningún
    reporte del tenant B (ni en `by-advisor` ni en `advisor-activity`); el cursor que serializa las
    pestañas (`actividad_cursores`) es por tenant y usuario. `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) en verde y
    `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.

## Supuestos

- «Asesor» = todo `User` con `rol: 'admin'` del tenant, sea cual sea su subrol (como en
  `getAdvisorReport`). El superadmin no tiene `tenantId` y no late.
- Umbral de inactividad fijo de 5 min (env), sin UI.
- Hay que informar a los asesores de que se mide su actividad (Ley 1581, Habeas Data). Es una tarea
  de negocio, no de código.

## Dependencias

- `HU-REP-01` (reporte por asesor) y `HU-REP-05` (iconos y refresco de dashboards) liberados.
- `ADR 0011` (reportes por subrol).
