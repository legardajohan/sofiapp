---
name: sofiapp-feature-scaffold
description: Andamia un feature nuevo (vertical slice) en apps/backend y/o apps/frontend de SofiApp con las convenciones del proyecto. Úsala al "crear un feature/módulo nuevo", "agregar un endpoint", "nueva pantalla" o similar. Genera la estructura correcta con multi-tenancy y el pipeline HTTP canónico ya cableados.
---

# Feature Scaffold — Vertical Slice

Reglas por app en sus `CLAUDE.md`. Aplica también `multi-tenancy-guard`, `typescript-strict-mode`, `clean-code-solid`. **Backend = ESM + funcional** (sin clases, solo named exports).

## Backend — `apps/backend/src/features/<feature>/` (6 archivos + montaje)
`<feature>` en kebab-case, singular. En orden:

1. **`.types.ts`** — enums/uniones, `I<X>`, `Create<X>DTO`, `Update<X>DTO`, `I<X>Response`. Campos de dominio en **español** (`rol`, `estadoComercial`, `nivelInteres`).
2. **`.model.ts`** — `Schema` + `I<X>Document extends I<X>, Document`. Incluye `tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true }`, índices compuestos `{ tenantId, <campo> }`, campos sensibles `select: false`, `{ timestamps: true }`.
3. **`.validation.ts`** — `z.object({ body, params, query })`; deriva DTOs con `z.infer`.
4. **`.service.ts`** — `export async function` con retorno explícito. Cada op recibe `tenantId` y va por `*Scoped`. Lecturas con `.lean()`. Errores → `throw new AppError(msg, code)`. Nunca conoce `req`/`res`.
5. **`.controller.ts`** — HTTP delgado: `const tenantId = req.user!.tenantId.toString();`, llama al service, mapea a `I<X>Response`, responde. **Sin `try/catch`**, sin `if (!user)`.
6. **`.routes.ts`** — `Router()`; cada ruta encadena el pipeline. `export default router`.

**Montaje (7):** en `app.ts` → `app.use('/api/<plural>', <feature>Routes);`.

> Superadmin (cross-tenant): omite `requireTenant`, usa `authorize(['superadmin'])`.
> Públicas (`login`, webhook): omiten `authenticateJWT`/`requireTenant`.
> Trabajo pesado (LLM, difusiones, envíos): no inline → BullMQ en `worker.ts` (`llm-process`, `outbound-send`, `campaign-broadcast`).

### Patrón service + controller
```ts
// service: recibe tenantId, va por *Scoped
export async function getClienteById(id: string, tenantId: string): Promise<IClienteResponse> {
  const doc = await findByIdScoped(ClienteModel, tenantId, id).lean();
  if (!doc) throw new AppError('Cliente no encontrado.', 404);
  return mapClienteToResponse(doc);
}
// controller: solo HTTP, sin try/catch
export async function getClienteByIdController(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId.toString();
  res.status(200).json(await getClienteById(req.params.id, tenantId));
}
```

### Pipeline en routes (orden obligatorio)
```ts
// imports: authenticateJWT ← middlewares/auth.middleware · requireTenant ← middlewares/require-tenant.middleware
//          authorize ← middlewares/role.middleware · validate ← middlewares/validate.middleware
//          asyncHandler ← middlewares/async-handler.middleware
//          AppError ← utils/AppError · *Scoped ← repositories/base.repository
router.get('/:id',
  authenticateJWT, requireTenant, authorize(['admin']),
  validate(getClienteSchema), asyncHandler(getClienteByIdController));
```

## Frontend — `apps/frontend/src/features/<feature>/`
0. **Skills de diseño (obligatorio, `CLAUDE.md` raíz §7):** antes de escribir cada componente nuevo o
   modificado, invoca `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`.
   Usa componentes de shadcn/ui en vez de controles hechos a mano cuando exista un equivalente, y
   deja cada componente prolijo en light y dark.
1. **`types/`** — `domain.ts`, `api.ts`, `store.ts` + `index.ts`.
2. **`use<Feature>Store.ts`** — Zustand (`isLoading`, `isSubmitting`, `error`, datos) vía `apiClient` de `@/api/apiClient`. **Nunca** `fetch`/`axios` directo. Token en cookie httpOnly; CSRF lo maneja el `apiClient`. **Rutas sin prefijo `/api`** (`apiClient.get('/conversations')`, no `'/api/conversations'`): `baseURL` ya lo resuelve — repetirlo produce `/api/api/...` → 404 en dev. Ver `apps/frontend/CLAUDE.md` § "Una sola puerta de salida HTTP".
3. **`components/`** — UI presentacional (`PascalCase.tsx`), sin llamadas a API.
4. **`pages/<Feature>Page.tsx`** — orquesta store + componentes.
5. **Ruta** bajo guarda de rol (RBAC); estado de servidor con **TanStack Query**.

## Verificación
- Backend: `pnpm --filter backend typecheck` + **test de aislamiento** del feature.
- Frontend: `pnpm --filter frontend build && lint`.
