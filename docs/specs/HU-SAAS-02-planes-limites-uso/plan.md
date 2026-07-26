# HU-SAAS-02 — Plan técnico (CÓMO)

## Árbol de archivos a crear / modificar

### Backend

```
apps/backend/src/
├── features/plan/                      ← CREAR (catálogo GLOBAL de planes; sin tenantId)
│   ├── plan.types.ts
│   ├── plan.model.ts
│   ├── plan.validation.ts
│   ├── plan.service.ts
│   ├── plan.controller.ts
│   └── plan.routes.ts
├── features/usage/                     ← CREAR (motor de cuotas; tenant-scoped)
│   ├── usage.types.ts
│   ├── usage.model.ts                  # colección tenant_usage
│   ├── usage.service.ts                # assertWithinQuota, incrementUsage, getTenantUsage, getCurrentPeriodo
│   └── usage.controller.ts             # getTenantUsageController
├── features/tenant/
│   ├── tenant.routes.ts                ← AMPLIAR: PATCH /:id/plan  ·  GET /:id/usage
│   ├── tenant.validation.ts            ← AMPLIAR: assignPlanSchema, tenantIdParamSchema
│   └── tenant.service.ts               ← AMPLIAR: guard `usuarios` en createTenant
├── features/message/message.service.ts ← AMPLIAR: guard + incremento `mensajesMes`
├── features/cliente/cliente.service.ts ← AMPLIAR: guard `leads` en la rama de inserción
├── config/seed/plans.seed.ts           ← CREAR: seed idempotente Básico/Estándar/Pro
└── app.ts                              ← AMPLIAR: app.use('/api/admin/plans', planRoutes) + ejecutar seed al arranque
```

### Frontend

```
apps/frontend/src/
├── features/admin-plans/               ← CREAR
│   ├── types/{domain.ts,api.ts,index.ts}
│   ├── api/admin-plans.ts              # vía apiClient (nunca fetch directo)
│   ├── useAdminPlansStore.ts           # Zustand
│   ├── components/{PlanTable.tsx,PlanForm.tsx}
│   └── pages/AdminPlansPage.tsx
├── features/admin-tenants/             ← AMPLIAR
│   ├── api/admin-tenants.ts            # + assignTenantPlan, getTenantUsage
│   └── components/{TenantPlanSelect.tsx,TenantUsagePanel.tsx}
└── routes/AdminRoutes.tsx              ← AMPLIAR: ruta /admin/plans (guard rol='superadmin')
```

### Docs (fuente de verdad — actualizar como parte de la implementación)

- `docs/data-model.md`: añadir `leads` a `plans.limites`; documentar la colección `tenant_usage`.
- `docs/api-contract.md`: registrar `/api/admin/plans*`, `/api/admin/tenants/:id/plan`, `.../usage`.

## Contratos

### plan.types.ts
```ts
export interface IPlanLimites {
  usuarios: number;      // total acumulado de usuarios del tenant
  mensajesMes: number;   // mensajes outbound por periodo (YYYY-MM)
  leads: number;         // total acumulado de clientes/leads del tenant
  campanasMes: number;   // campañas lanzadas por periodo
}
export interface IPlan {
  nombre: string;            // único ("Básico" | "Estándar" | "Pro" | personalizado)
  limites: IPlanLimites;
  precio: number;            // moneda del área comercial (placeholder en el seed)
  costoEstimado?: number;    // para rentabilidad (margen = precio - costoEstimado)
  activo: boolean;           // default true
}
export interface IPlanDocument extends IPlan, Document {}

export interface CreatePlanDTO extends IPlan {}
export interface UpdatePlanDTO {
  nombre?: string; limites?: Partial<IPlanLimites>;
  precio?: number; costoEstimado?: number; activo?: boolean;
}
export interface IPlanResponse {
  _id: string; nombre: string; limites: IPlanLimites;
  precio: number; costoEstimado?: number; activo: boolean;
  createdAt: string; updatedAt: string;
}
```

### plan.model.ts
- Schema `Plan` **global (sin `tenantId`)** — es un catálogo, igual que `Tenant`.
- `nombre` `{ unique: true }`; `limites` con las 4 claves `min: 0`; `precio` `min: 0`;
  `costoEstimado` opcional `min: 0`; `activo` `default: true`; `{ timestamps: true }`.

### plan.validation.ts (Zod)
```ts
const limitesSchema = z.object({
  usuarios: z.coerce.number().int().min(0),
  mensajesMes: z.coerce.number().int().min(0),
  leads: z.coerce.number().int().min(0),
  campanasMes: z.coerce.number().int().min(0),
});
export const listPlansSchema  = z.object({ query: z.object({ activo: z.coerce.boolean().optional() }) });
export const createPlanSchema = z.object({ body: z.object({
  nombre: z.string().min(2).max(60),
  limites: limitesSchema,
  precio: z.coerce.number().min(0),
  costoEstimado: z.coerce.number().min(0).optional(),
  activo: z.boolean().optional(),
})});
export const updatePlanSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({
    nombre: z.string().min(2).max(60).optional(),
    limites: limitesSchema.partial().optional(),
    precio: z.coerce.number().min(0).optional(),
    costoEstimado: z.coerce.number().min(0).optional(),
    activo: z.boolean().optional(),
  }),
});
```
`objectIdSchema` = el mismo reutilizable de `tenant.validation.ts` (`z.string().length(24).regex(/^[0-9a-f]{24}$/i)`).

### plan.service.ts (contratos de función)
```ts
listPlans(filter?: { activo?: boolean }): Promise<IPlanResponse[]>
createPlan(dto: CreatePlanDTO): Promise<IPlanResponse>     // 409 si nombre duplicado
updatePlan(id: string, dto: UpdatePlanDTO): Promise<IPlanResponse>  // 404 si no existe
getPlanLimits(planId: string | Types.ObjectId | null): Promise<IPlanLimites | null>  // null si sin plan/inactivo
mapPlanToResponse(doc: IPlanDocument): IPlanResponse
```
> `plans` es global: el CRUD NO usa `*Scoped` (no hay `tenantId`). Es el catálogo maestro, análogo
> al CRUD de tenants del superadmin.

### plan.routes.ts
```
// Cadena: authenticateJWT → authorize(['superadmin']) → validate → asyncHandler   (SIN requireTenant)
GET   /api/admin/plans        → listPlansController
POST  /api/admin/plans        → createPlanController
PATCH /api/admin/plans/:id    → updatePlanController
```

### usage.types.ts
```ts
export type QuotaMetric = 'usuarios' | 'mensajesMes' | 'leads' | 'campanasMes';
export interface IMetricUsage { usado: number; limite: number; restante: number; porcentaje: number; }
export interface IUsageResponse {
  tenantId: string;
  periodo: string;                 // 'YYYY-MM'
  plan: { _id: string; nombre: string } | null;
  metrics: Record<QuotaMetric, IMetricUsage>;
}
```

### usage.model.ts  (colección `tenant_usage`, tenant-scoped)
```js
{
  tenantId: ObjectId,   // required, index (regla data-model)
  periodo: String,      // 'YYYY-MM'
  mensajesMes: Number,  // default 0
  campanasMes: Number,  // default 0
  createdAt, updatedAt
}
// Índices: { tenantId: 1, periodo: 1 } unique
```
> Solo se persisten los contadores **mensuales**. `usuarios` y `leads` NO se guardan aquí: se
> derivan con `countDocuments` scoped en el momento de la consulta/enforcement (sin desfase).

### usage.service.ts
```ts
getCurrentPeriodo(now = new Date()): string   // `${yyyy}-${mm}` en UTC (MVP; nota de tz abajo)

// Uso actual de UNA métrica para un tenant (con su plan resuelto)
getMetricUsed(tenantId, metric): Promise<number>
//   usuarios   → User.countDocuments({ tenantId, activo: true })
//   leads      → Cliente.countDocuments({ tenantId })
//   mensajesMes/campanasMes → tenant_usage[{tenantId, periodo}][metric] ?? 0

assertWithinQuota(tenantId, metric): Promise<void>
//   limites = getPlanLimits(tenant.planId); si null → return (no-op)
//   if (getMetricUsed(tenantId, metric) >= limites[metric]) throw new AppError('Límite del plan alcanzado…', 429)

incrementUsage(tenantId, metric: 'mensajesMes' | 'campanasMes', amount = 1): Promise<void>
//   findOneAndUpdateScoped(Usage, tenantId, { periodo }, { $inc: { [metric]: amount } }, { upsert: true, new: true })

getTenantUsage(tenantId): Promise<IUsageResponse>   // arma las 4 métricas + plan + periodo
```
- Lecturas/escrituras de `tenant_usage` **siempre** vía `*Scoped` de `base.repository`.
- El helper de límites vive en `plan.service.getPlanLimits`; `usage.service` lo importa (dependencia
  `usage → plan`, sin ciclo).

### usage.controller.ts
```ts
getTenantUsageController(req, res)  // const { id } = req.params → getTenantUsage(id) → res.json(usage)
```

### Ampliaciones en `features/tenant/`
```ts
// tenant.validation.ts
export const assignPlanSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({ planId: objectIdSchema }),
});
export const tenantIdParamSchema = z.object({ params: z.object({ id: objectIdSchema }) });

// plan.service.ts (asignación — vive junto al catálogo porque valida el Plan)
assignPlanToTenant(tenantId: string, planId: string): Promise<ITenantResponse>
//   plan = Plan.findById(planId); si !plan || !plan.activo → AppError('Plan no disponible.', 409)
//   tenant = Tenant.findByIdAndUpdate(tenantId, { planId }, { new: true }); si !tenant → AppError(404)
```

### tenant.routes.ts (ampliación — mismo router `/api/admin/tenants`, superadmin, sin requireTenant)
```
PATCH /api/admin/tenants/:id/plan   → validate(assignPlanSchema)     → assignPlanToTenantController   (plan.controller)
GET   /api/admin/tenants/:id/usage  → validate(tenantIdParamSchema)  → getTenantUsageController        (usage.controller)
```

## Cableado del enforcement (integración con features existentes)

| Métrica | Punto de enforcement | Comportamiento |
|---|---|---|
| `mensajesMes` | `message.service.sendMessage` (HTTP outbound) | `assertWithinQuota` **antes** del envío; `incrementUsage` **tras** persistir. |
| `mensajesMes` | worker outbound del bot (job `outbound-send`) | mismo guard en `try/catch` → si 429, **omite y loguea** (no rompe el job). |
| `leads` | `cliente.service.upsertByMetaUser`, **solo** en la rama de inserción | pre-check con `assertWithinQuota('leads')`; en worker/webhook → soft (log, no descarta el inbound). |
| `usuarios` | `tenant.service.createTenant` (adminUser) y futuro CRUD `users` | `assertWithinQuota('usuarios')` antes de crear el `User`. |
| `campanasMes` | futuro `campaign.service` | guard listo; se cablea cuando exista el feature. |

## Seed (`config/seed/plans.seed.ts`)
- `ensureDefaultPlans()` idempotente: para cada uno de Básico/Estándar/Pro hace
  `Plan.updateOne({ nombre }, { $setOnInsert: {...} }, { upsert: true })`.
- Valores **placeholder** (comentados "acordar con comercial"), a modo de ejemplo:
  - Básico: `{ usuarios: 3, mensajesMes: 1000, leads: 500, campanasMes: 2 }`, `precio: 0`.
  - Estándar: `{ usuarios: 10, mensajesMes: 5000, leads: 5000, campanasMes: 10 }`.
  - Pro: `{ usuarios: 50, mensajesMes: 50000, leads: 50000, campanasMes: 100 }`.
- Se invoca una vez tras conectar Mongo en `app.ts` (y disponible como script `pnpm --filter backend seed:plans`).

## Frontend

- `admin-plans/api/admin-plans.ts`: `getAdminPlans()`, `createAdminPlan(payload)`, `updateAdminPlan(id, payload)` — todas vía `apiClient`.
- `AdminPlansPage`: `useQuery(['admin-plans'])` + tabla (`PlanTable`) con nombre, límites, precio, margen (`precio - costoEstimado`), estado; modal `PlanForm` (crear/editar) con validación alineada al Zod del backend.
- `admin-tenants/api/admin-tenants.ts`: añadir `assignTenantPlan(id, planId)` y `getTenantUsage(id)`.
- `TenantPlanSelect`: `<select>` de planes activos → `useMutation(assignTenantPlan)` → invalida `['admin-tenants']`.
- `TenantUsagePanel`: consume `getTenantUsage(id)`; una barra por métrica (`usado/limite`), color de aviso cuando `porcentaje ≥ 80`, y estado "Sin plan" cuando `plan === null`.
- `AdminRoutes.tsx`: ruta `/admin/plans` con guard `rol === 'superadmin'`.

## Notas

- **`mensajesMes` cuenta solo outbound** (agente + bot); los inbound no consumen cuota. Documentado en `data-model.md`.
- **Sin plan → sin límites** (no-op): coherente con `tenants.planId` opcional de HU-SAAS-01; la UI marca "Sin plan".
- **Reinicio mensual sin cron**: el periodo forma parte de la clave `{ tenantId, periodo }`; al cambiar el mes se crea un documento nuevo con contadores en 0.
- **Tz del periodo**: MVP en UTC. Si se requiere corte horario local (Colombia), se parametriza `getCurrentPeriodo` en una iteración posterior (no cambia el esquema).
- **Race conditions**: el pre-check de cuota no es transaccional; en MVP es aceptable (posible leve sobrepaso bajo alta concurrencia). Mitigación futura: `$inc` + relectura, o cuota en Redis.
- **Superadmin cross-tenant**: `GET /:id/usage` lee `tenant_usage` de un tenant arbitrario por diseño (excepción documentada, igual que el CRUD de tenants). El invariante de aislamiento aplica a actores con rol de tenant, no al superadmin.

## Verificación

- `pnpm --filter backend typecheck`
- `pnpm --filter backend test`
- `pnpm --filter frontend build && pnpm --filter frontend lint`
- Checklist PR `docs/multi-tenancy.md §9`
