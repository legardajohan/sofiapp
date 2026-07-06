# INF-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.

## Implementación

- [x] Crear `features/tenant/tenant.types.ts` con `ITenant`, `ITenantDocument`, `EstadoTenant`, `ICampoCaptura`.
- [x] Crear `features/tenant/tenant.model.ts` (schema + `{ slug }` unique, `{ timestamps: true }`).
- [x] Modificar `features/users/user.model.ts`: `tenantId: { type: ObjectId, ref:'Tenant', default:null, index:true }` + índice `{ email:1 } unique` (global, ADR 0003) + `{ tenantId:1, email:1 }` (no único).
- [x] Crear `repositories/base.repository.ts` con las 7 funciones `*Scoped` (adaptadas para Mongoose 8).
- [x] Crear `middlewares/require-tenant.middleware.ts`.
- [x] Crear/actualizar `types/express.d.ts` con `req.user` tipado (incluye `tenantId`).

## Tests (Vitest)

- [x] `base.repository.test.ts`:
  - [x] `findByIdScoped` con `tenantB` sobre un doc de `tenantA` → `null`.
  - [x] `createScoped(Model, tenantA, { tenantId: tenantB, ... })` → el doc guardado tiene `tenantId === tenantA`.
  - [x] `findScoped` nunca devuelve documentos de otro tenant.
  - [x] `findOneScoped` retorna null si no hay coincidencia en el tenant.
  - [x] `findOneAndUpdateScoped` solo actualiza documentos del tenant correcto.
  - [x] `deleteOneScoped` solo elimina documentos del tenant correcto.
- [x] `require-tenant.middleware.test.ts`:
  - [x] sin `req.user.tenantId` → 500.
  - [x] con `tenantId` → llama `next()`.

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores. ✅
- [x] `pnpm --filter backend test` con los tests anteriores en verde. ✅
      _Binario (~600MB) descargado con curl y cacheado en `.mongodb-binaries/`. Config: `MONGOMS_DOWNLOAD_DIR` + `MONGOMS_MD5_CHECK=false` en `vitest.config.ts`._
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.

## Definición de "hecho"

El terreno multi-tenant está listo: existe `Tenant`, `User` tiene `tenantId`, el repositorio
fuerza el aislamiento y `requireTenant` protege las rutas. Los siguientes features (`AUTH-01`,
`AUTH-02`) ya pueden construirse encima.
