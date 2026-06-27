# INF-02 — Plan técnico (CÓMO)

## Archivos a crear

```
apps/backend/src/
├── features/tenant/
│   ├── tenant.types.ts          # ITenant, ITenantDocument, EstadoTenant, camposCaptura
│   ├── tenant.model.ts          # schema Mongoose Tenant + índice { slug } unique
│   └── tenant.validation.ts     # (placeholder; CRUD real en SAAS-02)
├── features/users/
│   └── user.model.ts            # añade tenantId: ObjectId|null + índice { tenantId, email } unique
├── repositories/
│   └── base.repository.ts       # funciones *Scoped (tenant-safe)
├── middlewares/
│   └── require-tenant.middleware.ts
└── types/
    └── express.d.ts             # extiende Express.Request con user: SafeUser (incluye tenantId)
```

## Contratos

### `tenant.types.ts`
```ts
export type EstadoTenant = 'activo' | 'suspendido' | 'prueba';
export interface ICampoCaptura { key: string; label: string; tipo: 'string'|'number'|'enum'; opciones?: string[]; }
export interface ITenant {
  nombre: string; slug: string; nit?: string;
  contacto: { email: string; telefono: string };
  estado: EstadoTenant; planId: Types.ObjectId;
  camposCaptura: ICampoCaptura[];
}
export interface ITenantDocument extends ITenant, Document {}
```

### `base.repository.ts`
Copiar las 7 funciones de `docs/multi-tenancy.md` §3 **tal cual** (con `tenantId`).

### `require-tenant.middleware.ts`
```ts
export function requireTenant(req, res, next): void {
  if (!req.user || !req.user.tenantId) {
    res.status(500).json({ message: 'Error interno del servidor: información de usuario corrupta.' });
    return;
  }
  next();
}
```

### `types/express.d.ts`
```ts
declare global {
  namespace Express { interface Request { user?: SafeUser } }  // SafeUser incluye tenantId
}
```

## Notas

- `requireTenant` se aplica **inmediatamente después** de `authenticateJWT` en toda ruta
  tenant-aware. Las rutas del Superadmin NO lo usan.
- El JWT con `tenantId` se emite en `AUTH-01`; aquí solo se prepara el terreno (modelo + tipos +
  middleware + repositorio).

## Verificación

- `pnpm --filter backend typecheck`.
- Ejecutar los tests de `tasks.md`.
