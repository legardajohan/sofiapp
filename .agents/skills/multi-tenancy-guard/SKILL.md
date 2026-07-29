---
name: multi-tenancy-guard
description: Fuerza el aislamiento multi-tenant de SofiApp en todo código backend nuevo o editado. Úsala SIEMPRE que toques modelos, services, controllers, routes o repositorios, o al revisar una query a Mongo. Garantiza que cada operación pase por el repositorio tenant-safe y que el tenantId nazca del token.
---

# Multi-Tenancy Guard

> **Severidad máxima.** Una fuga de datos entre tenants es el peor fallo del sistema.
> Detalle en `docs/multi-tenancy.md`; base en `docs/adr/0001-shared-schema-tenant.md`.

Modelo: **shared schema** con discriminador `tenantId`. Aislamiento lógico, concentrado en `repositories/base.repository.ts`.

## Reglas no negociables
1. **Nunca consultes Mongo directo.** Prohibido `Model.find/findOne/findById/create/update/delete`. Usa siempre las `*Scoped`: `findScoped`, `findOneScoped`, `findByIdScoped`, `createScoped`, `findOneAndUpdateScoped`, `findOneAndDeleteScoped`, `deleteOneScoped`. Inyectan `tenantId` al final, pisando cualquier valor del llamador.
2. **`tenantId` siempre del token:** `const tenantId = req.user!.tenantId.toString();`. Nunca de `body/params/query`. El service lo recibe como argumento explícito.
3. **Todo modelo persistente lleva `tenantId`** `{ type: ObjectId, ref: 'Tenant', required: true, index: true }` + índices compuestos `{ tenantId, <campo> }`.
4. **Pipeline:** `authenticateJWT → requireTenant → authorize([roles]) → validate(zod) → asyncHandler(controller)`. `requireTenant` va justo tras `authenticateJWT` en toda ruta tenant-aware.
5. **Cada feature añade un test de aislamiento** (`docs/multi-tenancy.md` §8).

## Excepciones (únicas, documéntalas en el código)
1. **`login`** — lee `User` pre-auth, aún no hay token. `docs/adr/0003-login-tenant-resolution.md`.
2. **Webhook Meta** — resuelve tenant por `phone_number_id` (`MetaIntegration.findOne({ phoneNumberId })`, índice único global); luego todo vuelve a `*Scoped`. `docs/integrations/meta-whatsapp.md`.
3. **Superadmin** — rutas `/api/admin/*` con `authenticateJWT → authorize(['superadmin'])` **sin** `requireTenant`; funciones no scoped, restringidas por rol.

## Anti-ejemplos → corrección
```ts
// ❌ query directa sin tenant
const cliente = await ClienteModel.findById(id);
// ✅ acotado al tenant del token
const cliente = await findByIdScoped(ClienteModel, tenantId, id).lean();

// ❌ tenant del body (manipulable)
await createScoped(ClienteModel, req.body.tenantId, data);
// ✅ tenant del token
await createScoped(ClienteModel, req.user!.tenantId.toString(), data);
```

## Checklist de PR (`docs/multi-tenancy.md` §9)
```
[ ] Toda query vía *Scoped (sin Model.find/create directos)
[ ] tenantId del token (req.user!.tenantId), nunca de body/params
[ ] Modelos nuevos: tenantId required + indexado
[ ] Ninguna ruta tenant-aware sin requireTenant tras authenticateJWT
[ ] Rutas Superadmin restringidas con authorize(['superadmin'])
[ ] Test de aislamiento añadido
```

> Un service que olvida filtrar por `tenantId` es un **defecto crítico**, no un detalle de estilo.
