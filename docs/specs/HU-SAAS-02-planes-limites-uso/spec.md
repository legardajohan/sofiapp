# HU-SAAS-02 — Planes, límites de uso y rentabilidad (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`;
> la ejecución en `tasks.md`. Amplía INF-02 / HU-SAAS-01 con el catálogo de planes y el
> motor de cuotas que aplica los límites durante la operación.

**Estado:** implementado

> **Ampliación v2 (en planeación):** administradores configurables por plan, perfiles/etiquetas,
> catálogo de costos multimoneda, tasa de cambio oficial USD/COP (TRM) y fotografía financiera.
> Ver [`spec-v2-costeo-trm.md`](./spec-v2-costeo-trm.md) · [`plan-v2-costeo-trm.md`](./plan-v2-costeo-trm.md)
> · [`tasks-v2-costeo-trm.md`](./tasks-v2-costeo-trm.md). No reemplaza esta v1.

## Objetivo

Permitir al superadministrador controlar **planes** (Básico / Estándar / Pro) con **límites
cuantificables** (usuarios, mensajes/mes, leads, campañas/mes) y **aplicarlos como cuotas**
durante la operación: al alcanzar un límite, la acción medida se **bloquea** (bloqueo duro) y el
frontend **avisa** al acercarse. Cada empresa (tenant) tiene un plan asignado; el plan modela
además su `precio` para el cálculo de rentabilidad (la matriz comercial se acuerda con el área
de negocio; aquí se modela su estructura y aplicación técnica).

## Alcance

**Incluye:**
- Catálogo **global** de `Plan` (colección `plans`, **sin `tenantId`**) con `limites`, `precio`,
  `costoEstimado?` y `activo`. CRUD vía `/api/admin/plans` (solo superadmin).
- **Seed idempotente** de los tres planes Básico / Estándar / Pro con límites y precio placeholder.
- Asignación de plan a la empresa: `PATCH /api/admin/tenants/:id/plan`.
- Colección **tenant-scoped** `tenant_usage` (contadores mensuales por periodo `YYYY-MM`).
- **Motor de cuotas** (`usage.service`): `assertWithinQuota`, `incrementUsage`, `getTenantUsage`.
- Consulta de consumo: `GET /api/admin/tenants/:id/usage` (uso vs límite por métrica).
- **Cableado del bloqueo** en las rutas de escritura medidas ya existentes: envío outbound de
  mensajes (`message.service`), alta de lead (`cliente.service`), alta de usuario (`tenant.service`).
- Frontend: administración de planes (superadmin) y **indicadores de consumo vs límite** (aviso ≥80%).

**Fuera de alcance:**
- Matriz real de precios/costos por plan → la define el área comercial; aquí solo la estructura.
- Feature `campaigns` y CRUD `users`: no existen aún; para sus métricas (`campanasMes`, `usuarios`)
  se entrega el **guard reutilizable** listo para cablear cuando esos features lleguen.
- Facturación / cobros / pasarela de pago.
- Caché en Redis del uso (el MVP consulta Mongo; optimización posterior).

## Criterios de aceptación

1. Existe el modelo global `Plan` con `limites { usuarios, mensajesMes, leads, campanasMes }`,
   `precio`, `costoEstimado?` y `activo`; índice `{ nombre }` único. Un **seed idempotente** crea
   Básico / Estándar / Pro (valores placeholder documentados como "acordar con comercial").
2. `GET /api/admin/plans` lista planes; `POST /api/admin/plans` crea; `PATCH /api/admin/plans/:id`
   edita `limites`, `precio`, `costoEstimado`, `activo`. Solo `authorize(['superadmin'])`.
3. `PATCH /api/admin/tenants/:id/plan` asigna un plan **existente y activo** al tenant; devuelve
   404 si el tenant no existe y 409 si el plan no existe o está inactivo.
4. `GET /api/admin/tenants/:id/usage` devuelve, por cada métrica, `{ usado, limite, restante,
   porcentaje }`, más el `plan` asignado (o `null`) y el `periodo` actual (`YYYY-MM`).
5. `assertWithinQuota(tenantId, metric)` lanza `AppError(..., 429)` cuando `usado >= limite`. Si el
   tenant **no tiene plan asignado**, es **no-op** (no bloquea) y la vista de uso lo refleja.
6. Los contadores mensuales `mensajesMes` y `campanasMes` viven en `tenant_usage` por
   `{ tenantId, periodo }` (índice único) y se incrementan con `$inc` atómico; se **reinician**
   implícitamente al cambiar de periodo (sin cron). `usuarios` y `leads` se calculan con
   `countDocuments` scoped (totales acumulados, siempre exactos).
7. **DoD — bloqueo de mensajes:** en `message.service.sendMessage`, un tenant con plan Básico cuyo
   `mensajesMes` está en el límite recibe **429** y el mensaje **no se envía**; por debajo del
   límite, envía y `mensajesMes` se incrementa en 1. En el worker (bot / webhook) la acción medida
   se **omite y se registra** sin romper el pipeline.
8. Frontend: panel de administración de planes (crear/editar) accesible solo a `superadmin`, e
   **indicadores de consumo vs límite** por empresa (barras usado/límite con aviso visual ≥80%).
9. **Aislamiento multi-tenant:** `tenant_usage` es tenant-scoped y **siempre** se accede vía el
   repositorio `*Scoped`; `assertWithinQuota`/`incrementUsage` toman el `tenantId` **del token**
   (`req.user!.tenantId`), nunca del body/params. El uso de un tenant **nunca** contamina a otro.
   `plans` es un catálogo **global** y sus rutas usan `authorize(['superadmin'])` **sin**
   `requireTenant`. Existe un test de aislamiento que lo verifica.
10. `tsc --noEmit` en verde; tests de motor de cuotas, aislamiento y DoD de mensajes en verde.

## Dependencias

- `INF-01` (scaffolding) — completo.
- `INF-02` (modelo `Tenant`/`User`, `base.repository` `*Scoped`, `requireTenant`) — completo.
- `HU-SAAS-01` (CRUD `/api/admin/tenants`, `tenants.planId`) — completo; esta feature extiende su
  router `/api/admin/tenants` con los endpoints `:id/plan` y `:id/usage`.
- `HT-WA-01` (`message.service.sendMessage`, worker inbound) — hook de la métrica `mensajesMes`.
