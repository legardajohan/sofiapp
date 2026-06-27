# INF-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.

## Implementación

- [ ] Crear `features/tenant/tenant.types.ts` con `ITenant`, `ITenantDocument`, `EstadoTenant`, `ICampoCaptura`.
- [ ] Crear `features/tenant/tenant.model.ts` (schema + `{ slug }` unique, `{ timestamps: true }`).
- [ ] Modificar `features/users/user.model.ts`: `tenantId: { type: ObjectId, ref:'Tenant', default:null, index:true }` + índice `{ email:1 } unique` (global, ADR 0003) + `{ tenantId:1, email:1 }` (no único).
- [ ] Crear `repositories/base.repository.ts` con las 7 funciones `*Scoped` (copiar de `docs/multi-tenancy.md` §3).
- [ ] Crear `middlewares/require-tenant.middleware.ts`.
- [ ] Crear/actualizar `types/express.d.ts` con `req.user` tipado (incluye `tenantId`).

## Tests (Vitest)

- [ ] `base.repository.test.ts`:
  - [ ] `findByIdScoped` con `tenantB` sobre un doc de `tenantA` → `null`.
  - [ ] `createScoped(Model, tenantA, { tenantId: tenantB, ... })` → el doc guardado tiene `tenantId === tenantA`.
  - [ ] `findScoped` nunca devuelve documentos de otro tenant.
- [ ] `require-tenant.middleware.test.ts`:
  - [ ] sin `req.user.tenantId` → 500.
  - [ ] con `tenantId` → llama `next()`.

## Verificación final

- [ ] `pnpm --filter backend typecheck` sin errores.
- [ ] `pnpm --filter backend test` con los tests anteriores en verde.
- [ ] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.

## Definición de "hecho"

El terreno multi-tenant está listo: existe `Tenant`, `User` tiene `tenantId`, el repositorio
fuerza el aislamiento y `requireTenant` protege las rutas. Los siguientes features (`AUTH-01`,
`AUTH-02`) ya pueden construirse encima.
