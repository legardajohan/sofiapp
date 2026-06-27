# CLAUDE.md — Backend (apps/backend)

> Reglas y patrón del backend. Hereda y NO contradice el `CLAUDE.md` raíz y `docs/multi-tenancy.md`.

## Principios

- Express 5 + Mongoose 8 + Zod 4, **TypeScript `strict`, sin `any`**.
- Estilo **funcional**: sin clases, solo *named exports*. Funciones puras donde sea posible.
- **Screaming Architecture**: organización por feature/dominio. Sin `controllers/` ni
  `services/` globales planos.
- Inyección de dependencias para testear (servicios de terceros mockeables).

## Patrón de feature — 6 archivos + montaje en `app.ts`

Orden de creación de `src/features/<feature>/` (los 6 archivos del slice; el paso 7 es el montaje
del router en `app.ts`, no un archivo del feature):

1. `<feature>.types.ts` — enums, interfaces de dominio, DTOs (`Create<X>DTO`, `Update<X>DTO`, `I<X>Response`).
2. `<feature>.model.ts` — schema Mongoose con **`tenantId` requerido + indexado** + `I<X>`/`I<X>Document`.
3. `<feature>.validation.ts` — schemas Zod con forma `{ body, params, query }`.
4. `<feature>.service.ts` — lógica de negocio; **siempre** vía repositorio tenant-safe; `AppError` para errores esperables; `.lean()` en lecturas.
5. `<feature>.controller.ts` — capa HTTP delgada; `tenantId` del token; mapea a `I<X>Response`.
6. `<feature>.routes.ts` — endpoints + cadena de middlewares en orden fijo.
7. Montar en `app.ts`: `app.use('/api/<plural>', <feature>Routes)`.

## Cadena de middlewares (orden fijo)

```ts
router.<m>('<path>',
  authenticateJWT,            // 1. autentica, carga req.user
  requireTenant,              // 2. valida tenantId (inmediatamente después)
  authorize([/* roles */]),   // 3. autoriza por rol
  validate(<schema>),         // 4. valida input con Zod
  asyncHandler(<controller>)  // 5. envuelve el controller
);
```
Rutas Superadmin (cross-tenant): omiten `requireTenant`, usan `authorize(['superadmin'])`.
Rutas públicas (`/login`, webhook): omiten `authenticateJWT`/`requireTenant`.

## Reglas duras

- **Controllers:** sin `try/catch`, sin `if (!user)`, sin acceso a Mongoose. Obtienen
  `const tenantId = req.user!.tenantId.toString();` y delegan al service.
- **Services:** reciben `tenantId` como argumento; usan **solo** `*Scoped` del `base.repository`;
  lanzan `AppError(msg, code)`; nunca conocen `req`/`res`.
- **Modelos:** todo modelo persistente lleva `tenantId` (`required`, `index`).
- **Errores:** `AppError` + `asyncHandler` + `errorHandler` central. Cero `try/catch` redundante.
- **Env:** un módulo `config/` valida TODAS las env vars con Zod al arranque. Sin `process.env`
  disperso. **Sin fallback inseguro** para `JWT_SECRET` (fallar el arranque si falta).

## Procesos

- `app.ts` → proceso WEB (Express + Socket.IO gateway).
- `worker.ts` → proceso WORKER (BullMQ): `llm-process`, `outbound-send`, `campaign-broadcast`,
  (Fase 3) `flow-runtime`. Comparte el código de dominio; usa el mismo `base.repository`.

## Naming

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivos | `kebab-case.<rol>.ts` | `cliente.service.ts` |
| Funciones | `camelCase` verbo+sustantivo | `getClienteById` |
| Controllers | sufijo `Controller` | `updateClienteController` |
| Interfaces | `I<Nombre>` / `I<Nombre>Document` | `ICliente`, `IClienteDocument` |
| DTO seguro | `I<Nombre>Response` / `Safe<Nombre>` | `IClienteResponse`, `SafeUser` |
| Modelo | `PascalCase` singular | `Cliente`, `MetaIntegration` |
| Constantes | `SCREAMING_SNAKE_CASE` | `JWT_SECRET` |
| Campos de dominio | **español**, igual que `docs/data-model.md` | `rol`, `estadoComercial`, `nivelInteres` |

## Verificación antes de cerrar un feature

- `pnpm --filter backend typecheck` (`tsc --noEmit`) en verde.
- Test de **aislamiento multi-tenant** del feature añadido y en verde.
- Checklist de PR de `docs/multi-tenancy.md` §9 completo.
