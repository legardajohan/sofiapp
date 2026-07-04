# HU-SAAS-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature
> hasta que TODO esté en verde.

## Backend

### 1. Types — ampliar `features/tenant/tenant.types.ts`
- [x] Añadir `IAdminUserDTO`, `CreateTenantDTO`, `UpdateTenantDTO`, `UpdateTenantStatusDTO`, `ITenantResponse`.

### 2. Model — verificar (ya creado en INF-02)
- [x] Confirmar que `features/tenant/tenant.model.ts` existe con los campos de `docs/data-model.md`.
- [x] Confirmar que `features/users/user.model.ts` existe con `tenantId`, `passwordHash` (`select: false`), `rol`, `activo`.

### 3. Validation — reemplazar placeholder en `features/tenant/tenant.validation.ts`
- [x] Definir `objectIdSchema` reutilizable: `z.string().length(24).regex(/^[0-9a-f]{24}$/i)`.
- [x] Crear `listTenantsSchema` (query: search, page, limit).
- [x] Crear `createTenantSchema` (body: nombre, slug, nit?, contacto, planId?, adminUser?).
- [x] Crear `updateTenantSchema` (params.id + body parcial; sin slug).
- [x] Crear `updateTenantStatusSchema` (params.id + body.estado enum activo|suspendido).

### 4. Service — crear `features/tenant/tenant.service.ts`
- [x] `listTenants(query)`:
  - [x] Construir filtro `$regex` sobre `nombre` y `slug` si hay `search`.
  - [x] `TenantModel.find(filter).skip((page-1)*limit).limit(limit).lean()`.
  - [x] `TenantModel.countDocuments(filter)` para `total`.
  - [x] Retornar `{ data: docs.map(mapTenantToResponse), total, page, limit }`.
- [x] `createTenant(dto)`:
  - [x] `mongoose.startSession()` + `session.withTransaction(async () => { ... })`.
  - [x] Verificar slug único; si duplicado → `AppError('El slug ya está en uso.', 409)`.
  - [x] Crear `Tenant` con `{ session }`.
  - [x] Si `dto.adminUser`: hashear password (`bcrypt.hash(password, 10)`), crear `User` con `{ tenantId: tenant._id, rol: 'admin', activo: true, session }`.
  - [x] Si falla el User (ej. email duplicado) → la transacción hace rollback del Tenant.
  - [x] Retornar `mapTenantToResponse(tenant)`.
- [x] `updateTenant(id, dto)`:
  - [x] `TenantModel.findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true }).lean()`.
  - [x] Si no existe → `AppError('Empresa no encontrada.', 404)`.
- [x] `updateTenantStatus(id, dto)`:
  - [x] Buscar tenant; si no existe → `AppError('Empresa no encontrada.', 404)`.
  - [x] Si `tenant.estado === dto.estado` → `AppError('La empresa ya tiene ese estado.', 409)`.
  - [x] Actualizar y retornar.
- [x] `mapTenantToResponse(doc)`: serializar `_id.toString()`, `planId?.toString()`, excluir `camposCaptura`.

### 5. Controller — crear `features/tenant/tenant.controller.ts`
- [x] `listTenantsController`: `const { search, page, limit } = req.query` → service → `res.json(result)`.
- [x] `createTenantController`: `const dto = req.body` → service → `res.status(201).json(tenant)`.
- [x] `updateTenantController`: `const { id } = req.params; const dto = req.body` → service → `res.json(tenant)`.
- [x] `updateTenantStatusController`: `const { id } = req.params; const { estado } = req.body` → service → `res.json(tenant)`.
- [x] Sin `try/catch`. Sin acceso a Mongoose. Sin lógica de negocio.

### 6. Routes — crear `features/tenant/tenant.routes.ts`
- [x] `GET /` → `authenticateJWT, authorize(['superadmin']), validate(listTenantsSchema), asyncHandler(listTenantsController)`.
- [x] `POST /` → `authenticateJWT, authorize(['superadmin']), validate(createTenantSchema), asyncHandler(createTenantController)`.
- [x] `PATCH /:id` → `authenticateJWT, authorize(['superadmin']), validate(updateTenantSchema), asyncHandler(updateTenantController)`.
- [x] `PATCH /:id/status` → `authenticateJWT, authorize(['superadmin']), validate(updateTenantStatusSchema), asyncHandler(updateTenantStatusController)`.
- [x] SIN `requireTenant` ni `requireActiveTenant` en estas rutas.

### 7. Middleware — crear `middlewares/require-active-tenant.middleware.ts`
- [x] Implementar `requireActiveTenant`: consultar `TenantModel.findById(req.user!.tenantId).select('estado').lean()`.
- [x] Si tenant es null o `estado !== 'activo'` → `res.status(403).json({ message: '...' })`.
- [x] Insertar en `app.ts` tras `requireTenant` en el pipeline tenant-aware global.

### 8. Montaje en `app.ts`
- [x] `import tenantAdminRoutes from './features/tenant/tenant.routes'`.
- [x] `app.use('/api/admin/tenants', tenantAdminRoutes)`.

---

## Frontend

### 9. Types
- [x] `features/admin-tenants/types/domain.ts`: `ITenant` (con todos los campos de `ITenantResponse`), `EstadoTenant`.
- [x] `features/admin-tenants/types/api.ts`: `CreateTenantPayload`, `UpdateTenantPayload`, `UpdateTenantStatusPayload`, `TenantsListResponse` (con `data`, `page`, `limit`, `total`).
- [x] `features/admin-tenants/types/index.ts`: re-exports de los dos anteriores.

### 10. API functions
- [x] Crear `src/api/admin-tenants.ts` (o dentro de la feature):
  - [x] `getAdminTenants(params: { search?: string; page?: number; limit?: number })`.
  - [x] `createAdminTenant(payload: CreateTenantPayload)`.
  - [x] `updateAdminTenant(id: string, payload: UpdateTenantPayload)`.
  - [x] `updateAdminTenantStatus(id: string, estado: 'activo' | 'suspendido')`.
- [x] Todas usan `apiClient` del proyecto (`src/api/apiClient.ts`). Nunca `fetch` directo.

### 11. Store
- [x] `features/admin-tenants/useAdminTenantsStore.ts` (Zustand):
  - [x] Estado: `searchTerm: string`, `currentPage: number`, `isModalOpen: boolean`, `tenantEditing: ITenant | null`.
  - [x] Acciones: `openCreate()`, `openEdit(t: ITenant)`, `closeModal()`, `setSearch(s: string)`, `setPage(n: number)`.

### 12. Components
- [x] `TenantTable.tsx`:
  - [x] Props: `tenants: ITenant[]`, `total: number`, `page: number`, `limit: number`, `onPageChange`, `onEdit`.
  - [x] Columnas: Nombre, Slug, Estado (chip coloreado: verde=activo, gris=suspendido, amarillo=prueba), Plan, Creado.
  - [x] Input buscador debounced (≥300 ms) que llama `setSearch` del store.
  - [x] `<TenantStatusSwitch />` en columna Estado.
- [x] `TenantStatusSwitch.tsx`:
  - [x] Props: `tenant: ITenant`.
  - [x] `useMutation` que llama `updateAdminTenantStatus`; al completar invalida query `['admin-tenants']`.
  - [x] Toggle deshabilitado mientras el mutation está `isPending`.
- [x] `TenantForm.tsx`:
  - [x] Props: `tenant?: ITenant` (null = alta, definido = edición), `onSuccess`, `onCancel`.
  - [x] Campos: nombre, slug (auto-slug al escribir nombre en modo alta; readonly en modo edición), nit (opcional), email contacto, teléfono contacto, planId (opcional).
  - [x] Sección "Administrador inicial" colapsable, solo visible en modo alta (cuando `!tenant`).
  - [x] Validación en el cliente alineada con el schema Zod del backend.

### 13. Page
- [x] `features/admin-tenants/pages/AdminTenantsPage.tsx`:
  - [x] `useQuery(['admin-tenants', searchTerm, currentPage], () => getAdminTenants(...))`.
  - [x] `useMutation` para crear/editar con `onSuccess: () => { queryClient.invalidateQueries(['admin-tenants']); closeModal(); }`.
  - [x] Botón "Nueva empresa" → `openCreate()`.
  - [x] Modal con `<TenantForm />`.

### 14. Routes
- [x] `src/routes/AdminRoutes.tsx`:
  - [x] Guard: si `rol !== 'superadmin'` → redirect a `/`.
  - [x] Ruta `/admin/tenants` → `<AdminTenantsPage />`.

---

## Tests (Vitest — Backend)

### tenant.service.test.ts
- [x] `createTenant` con `adminUser` válido → Tenant y User persisten; User tiene `tenantId` correcto, `rol: 'admin'`, `activo: true`.
- [x] `createTenant` con email de adminUser duplicado → rollback atómico; Tenant NO persiste en DB.
- [x] `createTenant` con slug duplicado → lanza `AppError` con código 409.
- [x] `updateTenantStatus({ estado: 'suspendido' })` cuando ya es `'suspendido'` → lanza `AppError` 409.
- [x] `updateTenant` con id inexistente → lanza `AppError` 404.

### require-active-tenant.middleware.test.ts
- [x] Tenant con `estado: 'suspendido'` → `res.status(403)`.
- [x] Tenant con `estado: 'prueba'` → `res.status(403)`.
- [x] Tenant con `estado: 'activo'` → llama `next()`.

### tenant.routes.test.ts (integración)
- [x] `GET /api/admin/tenants` sin JWT → 401.
- [x] `GET /api/admin/tenants` con JWT de rol `admin` (no superadmin) → 403.
- [x] `POST /api/admin/tenants` con datos válidos y JWT superadmin → 201 + `ITenantResponse`.

---

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores.
- [x] `pnpm --filter backend test` todos en verde.
- [x] `pnpm --filter frontend build && pnpm --filter frontend lint` sin errores.
- [x] Checklist de PR de `docs/multi-tenancy.md §9` revisado.

## Definición de "hecho"

- El superadmin puede crear, editar y cambiar el estado de empresas desde el panel web.
- Al crear una empresa se puede dar de alta su admin inicial de forma atómica (rollback si falla).
- Empresas con `estado !== 'activo'` bloquean el acceso de sus usuarios con HTTP 403.
- `tsc --noEmit` en verde. Tests de servicio, middleware y rutas en verde.
