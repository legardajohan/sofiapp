# HU-SAAS-01 — Plan técnico (CÓMO)

## Árbol de archivos a crear / modificar

### Backend

```
apps/backend/src/
├── features/tenant/
│   ├── tenant.types.ts          ← AMPLIAR: DTOs CRUD + ITenantResponse
│   ├── tenant.model.ts          ← sin cambios (creado en INF-02)
│   ├── tenant.validation.ts     ← REEMPLAZAR placeholder: 4 schemas Zod reales
│   ├── tenant.service.ts        ← CREAR: listTenants, createTenant, updateTenant, updateTenantStatus
│   ├── tenant.controller.ts     ← CREAR: 4 controllers delgados
│   └── tenant.routes.ts         ← CREAR: 4 endpoints admin
└── middlewares/
    └── require-active-tenant.middleware.ts  ← CREAR
```

Montaje en `app.ts`: `app.use('/api/admin/tenants', tenantAdminRoutes)`

### Frontend

```
apps/frontend/src/
├── features/admin-tenants/
│   ├── types/
│   │   ├── domain.ts            ← ITenant, EstadoTenant
│   │   ├── api.ts               ← payloads y respuestas de la API
│   │   └── index.ts             ← re-exports
│   ├── useAdminTenantsStore.ts  ← Zustand: searchTerm, página, modal abierto, tenantEditando
│   ├── components/
│   │   ├── TenantTable.tsx      ← tabla + buscador
│   │   ├── TenantForm.tsx       ← formulario alta/edición (sección adminUser colapsable)
│   │   └── TenantStatusSwitch.tsx ← toggle activo↔suspendido con useMutation
│   └── pages/
│       └── AdminTenantsPage.tsx ← useQuery + orquestación
└── routes/
    └── AdminRoutes.tsx          ← guard rol='superadmin'; ruta /admin/tenants
```

## Contratos

### tenant.types.ts (ampliaciones sobre INF-02)

```ts
export interface IAdminUserDTO {
  nombre: string;
  email: string;
  password: string;
}

export interface CreateTenantDTO {
  nombre: string;
  slug: string;
  nit?: string;
  contacto: { email: string; telefono: string };
  planId?: string;       // opcional hasta que exista CRUD de Plan
  adminUser?: IAdminUserDTO;
}

export interface UpdateTenantDTO {
  nombre?: string;
  nit?: string;
  contacto?: { email?: string; telefono?: string };
  planId?: string;
}

export interface UpdateTenantStatusDTO {
  estado: 'activo' | 'suspendido';
}

export interface ITenantResponse {
  _id: string;
  nombre: string;
  slug: string;
  nit?: string;
  contacto: { email: string; telefono: string };
  estado: EstadoTenant;
  planId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### tenant.validation.ts (Zod)

```ts
const objectIdSchema = z.string().length(24).regex(/^[0-9a-f]{24}$/i);

export const listTenantsSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),
});

export const createTenantSchema = z.object({
  body: z.object({
    nombre: z.string().min(2).max(100),
    slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(60),
    nit: z.string().optional(),
    contacto: z.object({
      email: z.string().email(),
      telefono: z.string().min(7),
    }),
    planId: objectIdSchema.optional(),
    adminUser: z.object({
      nombre: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
    }).optional(),
  }),
});

export const updateTenantSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({
    nombre: z.string().min(2).max(100).optional(),
    nit: z.string().optional(),
    contacto: z.object({
      email: z.string().email().optional(),
      telefono: z.string().min(7).optional(),
    }).optional(),
    planId: objectIdSchema.optional(),
  }),
});

export const updateTenantStatusSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({ estado: z.enum(['activo', 'suspendido']) }),
});
```

### Endpoints (tenant.routes.ts)

```
// Cadena SIEMPRE: authenticateJWT → authorize(['superadmin']) → validate → asyncHandler
// SIN requireTenant (superadmin no pertenece a ningún tenant)
GET    /api/admin/tenants              → listTenantsController
POST   /api/admin/tenants              → createTenantController
PATCH  /api/admin/tenants/:id          → updateTenantController
PATCH  /api/admin/tenants/:id/status   → updateTenantStatusController
```

### require-active-tenant.middleware.ts

```ts
export async function requireActiveTenant(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  const tenant = await TenantModel
    .findById(req.user!.tenantId)
    .select('estado')
    .lean<{ estado: EstadoTenant }>();

  if (!tenant || tenant.estado !== 'activo') {
    res.status(403).json({ message: 'La empresa no está activa. Contacte al administrador.' });
    return;
  }
  next();
}
```

Se añade inmediatamente tras `requireTenant` en el pipeline de rutas tenant-aware de `app.ts`.

### tenant.service.ts (contratos de función)

```ts
listTenants(query: ListTenantsQuery): Promise<{ data: ITenantResponse[]; total: number; page: number; limit: number }>
createTenant(dto: CreateTenantDTO): Promise<ITenantResponse>        // usa transacción Mongoose
updateTenant(id: string, dto: UpdateTenantDTO): Promise<ITenantResponse>
updateTenantStatus(id: string, dto: UpdateTenantStatusDTO): Promise<ITenantResponse>
mapTenantToResponse(doc: ITenantDocument): ITenantResponse
```

`createTenant` usa `mongoose.startSession()` + `session.withTransaction()` para crear Tenant y
luego (si existe `adminUser`) User con `bcrypt.hash(password, 10)` y `rol: 'admin'`. Las rutas
admin no pasan por `*Scoped` (el tenant es el SUJETO del CRUD, no el contexto del actor).

### Paginación (listTenants)

Respuesta estándar del proyecto (`docs/api-contract.md`):
```json
{ "data": [...], "page": 1, "limit": 20, "total": 37 }
```
Búsqueda: `{ $or: [{ nombre: regex }, { slug: regex }] }` con `$options: 'i'`.

## Notas

- `slug` se valida único en la DB al crear; si está duplicado → `AppError('El slug ya está en uso.', 409)`.
- `slug` no es editable tras la creación (identidad estable del tenant).
- `planId` es opcional; el superadmin puede asignarlo más adelante vía PATCH.
- `requireActiveTenant` hace 1 query a Mongo por request tenant-aware. Aceptable en el MVP;
  puede cachearse en Redis en iteraciones futuras.
- El Superadmin está exento de `requireTenant` y `requireActiveTenant` por diseño
  (`apps/backend/CLAUDE.md` §excepciones).

## Verificación

- `pnpm --filter backend typecheck`
- `pnpm --filter backend test`
- `pnpm --filter frontend build && pnpm --filter frontend lint`
- Checklist PR `docs/multi-tenancy.md §9`
