# INF-02 — Modelo de Tenant y middleware de resolución (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Es el núcleo del SaaS: la columna vertebral del aislamiento de datos.

## Objetivo

Disponer del modelo `Tenant`, el modelo `User` con `tenantId`, la emisión del JWT con `tenantId`
embebido, y el middleware `requireTenant` que garantiza la presencia del tenant en cada petición
tenant-aware. A partir de aquí, cualquier feature puede operar de forma aislada por tenant.

## Alcance

Incluye:
- Esquema `Tenant` (ver `docs/data-model.md` → `tenants`).
- Campo `tenantId` en `User` (`null` permitido solo para Superadmin).
- `repositories/base.repository.ts` con las funciones `*Scoped`.
- Middleware `requireTenant` (va inmediatamente tras `authenticateJWT`).
- Extensión de tipos de Express (`req.user` tipado con `tenantId`).

Fuera de alcance (otros features):
- Login y emisión de JWT completos → `AUTH-01`.
- Motor RBAC → `AUTH-02`.
- CRUD de tenants del Superadmin → `SAAS-02`.

## Criterios de aceptación

1. Existe el modelo `Tenant` con índice `{ slug }` único y los campos de `data-model.md`.
2. `User.tenantId` es `ObjectId | null`, indexado; `{ email }` único global (ADR 0003) y
   `{ tenantId, email }` **no** único para lookups scoped.
3. `base.repository.ts` exporta `findScoped`, `findOneScoped`, `findByIdScoped`, `createScoped`,
   `findOneAndUpdateScoped`, `findOneAndDeleteScoped`, `deleteOneScoped`, todas inyectando
   `tenantId` al final del filtro/payload.
4. `requireTenant` devuelve 500 si falta `req.user.tenantId` (corrupción de integridad) y llama
   `next()` en caso contrario.
5. `req.user` está tipado globalmente con `tenantId`.
6. **Test de aislamiento:** un documento creado con `createScoped(Model, tenantA, ...)` no es
   accesible con `findByIdScoped(Model, tenantB, id)` (devuelve `null`); y un `tenantId`
   inyectado en el `data` es sobrescrito por el del argumento.
7. `tsc --noEmit` en verde.

## Dependencias

- `INF-01` (scaffolding y TypeScript) debe estar completo.
