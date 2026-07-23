# HU-SAAS-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature
> hasta que TODO esté en verde. Respeta el patrón de 6 archivos y el aislamiento multi-tenant.

## Backend — Feature `plan/` (catálogo GLOBAL)

### 1. Types — `features/plan/plan.types.ts`
- [ ] `IPlanLimites { usuarios, mensajesMes, leads, campanasMes }`.
- [ ] `IPlan`, `IPlanDocument`, `CreatePlanDTO`, `UpdatePlanDTO`, `IPlanResponse` (con `costoEstimado?`).

### 2. Model — `features/plan/plan.model.ts`
- [ ] Schema `Plan` **sin `tenantId`** (catálogo global); `nombre` `{ unique: true }`; `limites` (4 claves `min:0`); `precio` `min:0`; `costoEstimado?` `min:0`; `activo` `default:true`; `{ timestamps:true }`.

### 3. Validation — `features/plan/plan.validation.ts`
- [ ] `limitesSchema`, `listPlansSchema`, `createPlanSchema`, `updatePlanSchema` (reutilizar `objectIdSchema`).

### 4. Service — `features/plan/plan.service.ts`
- [ ] `listPlans(filter?)`, `createPlan` (409 nombre duplicado), `updatePlan` (404), `mapPlanToResponse`.
- [ ] `getPlanLimits(planId)` → `IPlanLimites | null` (null si sin plan o plan inactivo).
- [ ] `assignPlanToTenant(tenantId, planId)`: valida plan existente+activo (409) y tenant existente (404); `Tenant.findByIdAndUpdate({ planId })`.
- [ ] El CRUD de `plans` NO usa `*Scoped` (colección global, sin `tenantId`).

### 5. Controller — `features/plan/plan.controller.ts`
- [ ] `listPlansController`, `createPlanController` (201), `updatePlanController`, `assignPlanToTenantController`.
- [ ] Sin `try/catch`, sin acceso a Mongoose, sin lógica de negocio.

### 6. Routes — `features/plan/plan.routes.ts`
- [ ] `GET/POST /` y `PATCH /:id` → `authenticateJWT, authorize(['superadmin']), validate(...), asyncHandler(...)`. **SIN** `requireTenant`.

## Backend — Feature `usage/` (motor de cuotas, tenant-scoped)

### 7. Types — `features/usage/usage.types.ts`
- [ ] `QuotaMetric`, `IMetricUsage`, `IUsageResponse`.

### 8. Model — `features/usage/usage.model.ts`
- [ ] Colección `tenant_usage`: `tenantId` (required, index), `periodo`, `mensajesMes` (default 0), `campanasMes` (default 0); índice `{ tenantId:1, periodo:1 }` **unique**; `{ timestamps:true }`.

### 9. Service — `features/usage/usage.service.ts`
- [ ] `getCurrentPeriodo(now?)` → `'YYYY-MM'` (UTC).
- [ ] `getMetricUsed(tenantId, metric)`: usuarios→`User.countDocuments({tenantId, activo:true})`; leads→`Cliente.countDocuments({tenantId})`; mensuales→contador de `tenant_usage`.
- [ ] `assertWithinQuota(tenantId, metric)`: resuelve límites vía `getPlanLimits`; **no-op** si null; lanza `AppError(429)` si `usado >= limite`.
- [ ] `incrementUsage(tenantId, metric, amount=1)`: `findOneAndUpdateScoped(Usage, tenantId, { periodo }, { $inc }, { upsert:true, new:true })`.
- [ ] `getTenantUsage(tenantId)`: arma las 4 `IMetricUsage` + `plan` (o null) + `periodo`.
- [ ] Todo acceso a `tenant_usage` vía `*Scoped`; `tenantId` nunca del body/params en enforcement.

### 10. Controller — `features/usage/usage.controller.ts`
- [ ] `getTenantUsageController`: `const { id } = req.params` → `getTenantUsage(id)` → `res.json(...)`.

## Backend — Ampliaciones en features existentes

### 11. `features/tenant/`
- [ ] `tenant.validation.ts`: añadir `assignPlanSchema` y `tenantIdParamSchema`.
- [ ] `tenant.routes.ts`: montar `PATCH /:id/plan` (→ `assignPlanToTenantController`) y `GET /:id/usage` (→ `getTenantUsageController`), superadmin, sin `requireTenant`.
- [ ] `tenant.service.ts::createTenant`: si `dto.adminUser`, `await assertWithinQuota(tenant._id, 'usuarios')` antes de crear el `User` (dentro de la transacción).

### 12. `features/message/message.service.ts`
- [ ] `sendMessage`: `await assertWithinQuota(tenantId, 'mensajesMes')` **antes** del envío a Meta.
- [ ] Tras `createScoped(Message, ...)` outbound: `await incrementUsage(tenantId, 'mensajesMes')`.
- [ ] Worker `outbound-send` (bot): mismo guard en `try/catch` → si `AppError(429)`, **omite y loguea** (no relanza).

### 13. `features/cliente/cliente.service.ts`
- [ ] `upsertByMetaUser`: pre-check `assertWithinQuota(tenantId, 'leads')` solo cuando se vaya a **insertar** un lead nuevo; en contexto worker/webhook, capturar el 429 → **log** y no descartar el mensaje inbound.

### 14. Seed — `config/seed/plans.seed.ts`
- [ ] `ensureDefaultPlans()` idempotente (`upsert` por `nombre`) con Básico/Estándar/Pro (valores placeholder comentados "acordar con comercial").
- [ ] Script `pnpm --filter backend seed:plans` en `package.json`.

### 15. Montaje — `app.ts`
- [ ] `import planRoutes from './features/plan/plan.routes'` → `app.use('/api/admin/plans', planRoutes)`.
- [ ] Invocar `ensureDefaultPlans()` tras conectar a Mongo.

### 16. Docs (fuente de verdad)
- [ ] `docs/data-model.md`: añadir `leads` a `plans.limites`; documentar colección `tenant_usage` (+ nota "mensajesMes = outbound").
- [ ] `docs/api-contract.md`: registrar `/api/admin/plans*`, `/api/admin/tenants/:id/plan`, `.../usage`.

---

## Frontend

### 17. `features/admin-plans/`
- [ ] `types/{domain.ts,api.ts,index.ts}`: `IPlan`, `IPlanLimites`, payloads y respuestas.
- [ ] `api/admin-plans.ts`: `getAdminPlans`, `createAdminPlan`, `updateAdminPlan` (vía `apiClient`).
- [ ] `useAdminPlansStore.ts` (Zustand): modal abierto, plan en edición.
- [ ] `components/PlanTable.tsx`: nombre, límites, precio, **margen** (`precio - costoEstimado`), estado.
- [ ] `components/PlanForm.tsx`: crear/editar con validación alineada al Zod backend.
- [ ] `pages/AdminPlansPage.tsx`: `useQuery(['admin-plans'])` + `useMutation` (invalidar en `onSuccess`).

### 18. Ampliar `features/admin-tenants/`
- [ ] `api/admin-tenants.ts`: `assignTenantPlan(id, planId)`, `getTenantUsage(id)`.
- [ ] `TenantPlanSelect.tsx`: selector de planes activos → `useMutation(assignTenantPlan)` → invalida `['admin-tenants']`.
- [ ] `TenantUsagePanel.tsx`: barras `usado/limite` por métrica, aviso visual `porcentaje ≥ 80`, estado "Sin plan" si `plan === null`.

### 19. Rutas
- [ ] `routes/AdminRoutes.tsx`: ruta `/admin/plans` con guard `rol === 'superadmin'`.

---

## Tests (Vitest — Backend)

### plan.service.test.ts
- [ ] `createPlan` con `nombre` duplicado → `AppError` 409.
- [ ] `updatePlan` con id inexistente → `AppError` 404.
- [ ] `assignPlanToTenant` con plan inactivo/inexistente → `AppError` 409; con tenant inexistente → 404.
- [ ] `getPlanLimits(null)` → `null`.

### usage.service.test.ts
- [ ] `incrementUsage(tenantA, 'mensajesMes')` crea/incrementa el doc del periodo actual.
- [ ] Documentos de periodos distintos son independientes (simular `getCurrentPeriodo` → reinicio mensual).
- [ ] `assertWithinQuota('mensajesMes')` con contador `>= limite` → `AppError` 429; por debajo → no lanza.
- [ ] `assertWithinQuota('usuarios')` cuenta `User` del tenant; al alcanzar `limites.usuarios` → 429.
- [ ] Tenant **sin plan** → `assertWithinQuota` es no-op (no lanza) para cualquier métrica.
- [ ] `getTenantUsage` devuelve las 4 métricas con `usado/limite/restante/porcentaje` correctos.

### usage.isolation.test.ts (**aislamiento multi-tenant**)
- [ ] `incrementUsage(tenantA, 'mensajesMes')` **no** altera el uso de `tenantB` (contadores independientes por `tenantId`).
- [ ] `getMetricUsed(tenantB, 'leads')` no cuenta clientes de `tenantA`.
- [ ] Un doc `tenant_usage` de `tenantA` no es accesible vía `*Scoped` con `tenantB`.

### message.service.test.ts (**DoD**)
- [ ] Tenant Básico con `mensajesMes` en el límite → `sendMessage` lanza 429 y **no** llama al cliente de Meta.
- [ ] Por debajo del límite → envía y `mensajesMes` incrementa en 1.

### routes (integración)
- [ ] `GET /api/admin/plans` sin JWT → 401; con rol `admin` (no superadmin) → 403.
- [ ] `POST /api/admin/plans` superadmin válido → 201 + `IPlanResponse`.
- [ ] `PATCH /api/admin/tenants/:id/plan` con planId válido → 200; plan inactivo → 409.
- [ ] `GET /api/admin/tenants/:id/usage` superadmin → 200 + `IUsageResponse`.

---

## Verificación final

- [ ] `pnpm --filter backend typecheck` sin errores.
- [ ] `pnpm --filter backend test` todos en verde (cuotas + aislamiento + DoD de mensajes).
- [ ] `pnpm --filter frontend build && pnpm --filter frontend lint` sin errores.
- [ ] Checklist de PR de `docs/multi-tenancy.md §9` revisado.
- [ ] `spec.md` actualizado a `**Estado:** implementado` (lo hace `/sdd-implement`).

## Notas de implementación (desviaciones menores)

- El **seed** de planes corre automáticamente al arrancar `app.ts` (junto a `seedSuperadmin`).
  No se añadió un script `pnpm seed:plans` aparte para no introducir un nuevo entrypoint; el
  arranque ya garantiza "existen los planes".
- La **asignación de plano de plan** (`assignPlanToTenant`) y su controlador viven en el feature
  `tenant/` (mutan `Tenant` y validan el `Plan` vía su modelo), evitando un ciclo de imports
  `tenant.service ↔ plan.service`. `getPlanLimits` queda en `plan/`.
- El guard de `mensajesMes` en el **worker del bot** queda listo vía `assertWithinQuota`, pero el
  job `outbound-send` sigue siendo un placeholder (se cablea cuando el bot envíe de verdad). El
  enforcement real y testeado (DoD) está en `message.service.sendMessage`.

## Definición de "hecho"

- Existen los planes Básico / Estándar / Pro (seed) con límites de usuarios, mensajes/mes, leads y campañas/mes.
- Cada empresa puede tener un plan asignado (`PATCH /api/admin/tenants/:id/plan`).
- Al alcanzar un límite, la acción medida se **bloquea** (429) o, en el worker, se **omite y registra**.
- **DoD:** un tenant Básico que supera su límite de mensajes recibe el bloqueo esperado y el mensaje no se envía.
- El superadmin administra planes y ve el consumo vs límite por empresa (aviso ≥80%).
- Aislamiento multi-tenant verificado; `tsc --noEmit` y tests en verde.
