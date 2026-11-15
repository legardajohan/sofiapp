# AUTH-05 — Plan técnico

> **CÓMO** implementar `spec.md`. Se construye sobre AUTH-04 (`features/users/user.service.ts`,
> `middlewares/authorize-rol-empresa.middleware.ts`) en la rama `feat/AUTH-03`, sin rama propia.

## Matriz de gestión (fuente de verdad de los asserts y de `acciones`)

| Actor ↓ / Objetivo → | Principal | Administrador | Coordinador | Asesor (su equipo o sin coord.) | Asesor (otro equipo) |
|---|---|---|---|---|---|
| Principal | solo su contraseña (perfil) | ✅ + permiso | ✅ | ✅ | ✅ |
| Admin **con** permiso | 403 | ✅ (sin permiso) | ✅ | ✅ | ✅ |
| Admin **sin** permiso | 403 | 403 | ✅ | ✅ | ✅ |
| Coordinador | 404 | 404 | 404 | ✅ (sin cambiar rol) | 404 |
| Asesor | 403 (ruta) | 403 | 403 | 403 | 403 |

- ✅ = ver, editar, restablecer contraseña, desactivar/reactivar, eliminar. Sobre uno mismo siguen las
  reglas de AUTH-03 (no cambiar el propio rol, estado ni contraseña por gestión; no eliminarse).
- **Crear:** principal y admin con permiso → los 3 roles; admin sin permiso → coordinador y asesor;
  coordinador → asesor.
- **Cambiar rol** de X a Y exige poder gestionar a X **y** poder crear Y.
- **Permiso `puedeGestionarAdministradores`:** solo lo escribe el principal.

## Archivos a crear

| Ruta | Propósito |
|---|---|
| `apps/backend/src/features/users/user.permisos.ts` | Funciones **puras** de la matriz: `puedeGestionar(actor, objetivo)`, `rolesCreables(actor)`, `accionesSobre(actor, objetivo)`. Sin BD: testeables por unidad y compartidas por asserts y listado. |
| `apps/backend/src/features/users/user.permisos.test.ts` | Unitarios de la matriz completa. |
| `apps/backend/src/features/users/user.principal.test.ts` | HTTP: principal intocable, admin con/sin permiso, permiso. |
| `apps/backend/src/features/users/user.delete.test.ts` | HTTP: borrado lógico y sus efectos. |
| `apps/backend/src/features/auth/auth.password.test.ts` | HTTP: contraseña propia. |
| `apps/backend/src/features/tenant/tenant.principal.test.ts` | HTTP: endpoints del superadmin. |
| `apps/backend/src/seed/migrate-usuario-principal.ts` (+ `.test.ts`) | Migración idempotente, dry-run por defecto. |
| `apps/frontend/src/features/users/components/DeleteUserDialog.tsx` | Eliminar con resolución de dependencias. |
| `apps/frontend/src/features/users/components/ChangeOwnPasswordDialog.tsx` | Cambiar mi contraseña. |
| `apps/frontend/src/features/users/components/CupoUsuarios.tsx` | Uso del plan en la pantalla Usuarios. |
| `apps/frontend/src/features/admin-tenants/components/ResetPrincipalPasswordDialog.tsx` | Reset del principal (superadmin). |
| `docs/adr/0018-usuario-principal-y-accesos-iguales.md` | Decisión: principal, permiso, borrado lógico, accesos iguales, cancelación de la visibilidad por equipo. |

## Archivos a tocar

- **Backend — users:** `user.types.ts`, `user.model.ts`, `user.mapper.ts`, `user.validation.ts`,
  `user.service.ts`, `user.controller.ts`, `user.routes.ts`, `user.test-helpers.ts` (`crearUsuario`
  con `esPrincipal`/`puedeGestionarAdministradores`).
- **Backend — auth:** `auth.types.ts` (`ISessionUser`, `mapUserToSession`), `auth.validation.ts`,
  `auth.service.ts`, `auth.controller.ts`, `auth.routes.ts`.
- **Backend — tenant:** `tenant.service.ts` (`createTenant`), `tenant.validation.ts`,
  `tenant.controller.ts`, `tenant.routes.ts`.
- **Backend — otros:** `middlewares/authorize-rol-empresa.middleware.ts`, `features/plan/plan.validation.ts`,
  `features/plan/plan.service.ts`, `features/audit/audit.types.ts`, `seed/seed-inbox-demo.ts`,
  `apps/backend/package.json` (`migrate:usuario-principal`).
- **Frontend:** `lib/roles.ts`, `stores/authStore.ts`, `features/users/{types.ts,api.ts}`,
  `features/users/hooks/useManageUsers.ts`, `features/users/pages/UsersPage.tsx`,
  `features/users/components/UserFormSheet.tsx`, `components/layout/NavUser.tsx`,
  `features/admin-tenants/components/TenantTable.tsx`, `api/admin-tenants.ts`, copy de datos
  sensibles donde se use `MOTIVO_DATOS_SENSIBLES`.
- **Docs:** `product.md`, `domain.md`, `data-model.md`, `api-contract.md`, `apps/frontend/CLAUDE.md`,
  `docs/adr/0017-roles-de-empresa.md` (nota "reemplazado en parte por 0018"),
  `docs/specs/PENDIENTES-roles-empresa.md`.

## Contratos

### `user.types.ts`

```ts
export interface IUser {
  // … AUTH-04
  esPrincipal: boolean;                    // default false; uno por tenant
  puedeGestionarAdministradores: boolean;  // default false; solo administradores no principales
  eliminado: boolean;                      // default false (borrado lógico)
  eliminadoEn?: Date;
  eliminadoPor?: Types.ObjectId;
  emailOriginal?: string;                  // email antes de reescribirlo al eliminar
}

export interface IAccionesUsuario { editar: boolean; contrasena: boolean; estado: boolean; eliminar: boolean }

export interface IUserResponse {
  // … AUTH-04
  esPrincipal: boolean;
  puedeGestionarAdministradores: boolean;
  /** Solo en `GET /manage` y `GET /:id`: lo que el actor puede hacer sobre este usuario. */
  acciones?: IAccionesUsuario;
}

/** Actor de gestión: token + flags leídos de BD en cada petición (`cargarActor`). */
export interface IActorGestion {
  sub: string;
  rolEmpresa: RolEmpresa;
  esPrincipal: boolean;
  puedeGestionarAdministradores: boolean;
}

export interface CreateUserDTO { /* … */ puedeGestionarAdministradores?: boolean }
export interface UpdateUserDTO { /* … */ puedeGestionarAdministradores?: boolean }
export interface DeleteUserDTO { conversaciones?: MoverConversaciones; equipo?: MoverEquipo }

export interface ICupoMetrica { usado: number; limite: number | null }
export interface ICupoUsuarios { usuarios: ICupoMetrica; administradores: ICupoMetrica }
```

### `user.model.ts`

```ts
esPrincipal: { type: Boolean, default: false },
puedeGestionarAdministradores: { type: Boolean, default: false },
eliminado: { type: Boolean, default: false },
eliminadoEn: { type: Date },
eliminadoPor: { type: Schema.Types.ObjectId, ref: 'User' },
emailOriginal: { type: String },

UserSchema.index(
  { tenantId: 1 },
  { unique: true, partialFilterExpression: { esPrincipal: true }, name: 'tenant_principal_unico' },
);
```

El índice único global de `email` se mantiene (ADR 0003): al eliminar se reescribe el email a
`<id>.eliminado@invalid.sofiapp` (dominio reservado `.invalid`, RFC 2606), lo que libera el original.

### `user.validation.ts`

- `createUserSchema` / `updateUserSchema`: `puedeGestionarAdministradores: z.boolean().optional()`;
  refine en create: solo con `rolEmpresa === 'administrador'` (si no, 400). En update, la regla con el
  rol final se valida en el service.
- `deleteUserSchema`: `{ body: { conversaciones?, equipo? }.strict(), params: idParams, query: {} }`
  (reutiliza `moverConversaciones` y `moverEquipo`).
- `cupoSchema`: body/params/query vacíos.

### `user.permisos.ts` (puro)

```ts
type ObjetivoGestion = { id: string; rolEmpresa: RolEmpresa; esPrincipal: boolean; coordinadorId: string | null };

export function rolesCreables(actor: IActorGestion): readonly RolEmpresa[];
/** 'ok' | 'prohibido' (403: lo ve) | 'invisible' (404: no lo ve). */
export function puedeGestionar(actor: IActorGestion, objetivo: ObjetivoGestion): 'ok' | 'prohibido' | 'invisible';
export function accionesSobre(actor: IActorGestion, objetivo: ObjetivoGestion): IAccionesUsuario;
```

`accionesSobre` aplica además las reglas sobre uno mismo (todas en `false` en la propia fila; la UI
ofrece "Cambiar mi contraseña" aparte).

### `user.service.ts` (cambios)

- `cargarActor(tenantId, sub)`: `findByIdScoped(User, …).select('rolEmpresa esPrincipal
  puedeGestionarAdministradores activo')`; inactivo o inexistente → 401. Lo llaman todas las funciones de
  gestión (sustituye al `UserActor` del token en esas funciones).
- `cargarObjetivoPara(tenantId, actor, id)`:
  - Coordinador: `findOneScoped(User, { _id, rol: 'admin', rolEmpresa: 'asesor', coordinadorId: { $in: [actor, null] }, eliminado: { $ne: true } })`.
  - Resto: `findByIdScoped` + `eliminado` → 404; luego `puedeGestionar` → `prohibido` = 403.
  - `GET /:id` usa una variante de **lectura** que permite ver (no gestionar) a quien aparece en el listado.
- `createTenantUser`: `rolesCreables(actor)` (fuera → 403). Coordinador: `coordinadorId` libre, validado
  con `assertCoordinadorValido`. `puedeGestionarAdministradores` solo si `actor.esPrincipal` (si no, 403).
- `updateTenantUser`: objetivo vía `cargarObjetivoPara`. Coordinador: puede `coordinadorId`, no
  `rolEmpresa` (403). Cambio de rol: además `rolesCreables(actor).includes(rolFinal)`. Permiso: solo
  principal; `rolFinal !== 'administrador'` → `puedeGestionarAdministradores: false`. Audita
  `user.admin_permission_changed` cuando cambia.
- `listManageableUsers`: filtro base `{ rol: 'admin', eliminado: { $ne: true } }`; coordinador →
  `rolEmpresa: 'asesor', coordinadorId: { $in: [actor, null] }` (su filtro `coordinadorId` se interseca
  con ese alcance); cada fila con `acciones: accionesSobre(actor, fila)`.
- `deleteTenantUser(tenantId, actorSub, id, dto)`: `assertNoEsUnoMismo` (409) → `cargarObjetivoPara` →
  si es Administrador activo, `assertNoUltimoAdministrador` → misma resolución que `desactivarUsuario`
  (`contarDependencias`, 409 `USER_HAS_DEPENDENCIES`, `moveAssignedConversations`, `moverEquipo`) en una
  transacción → `$set { eliminado: true, activo: false, eliminadoEn, eliminadoPor, emailOriginal, email:
  `${id}.eliminado@invalid.sofiapp` }` → `revokeUserSessions` → tras commit `notifySessionsRevoked` y
  auditoría `user.deleted` (+ `user.conversations_moved` / `user.team_moved` si hubo). Extraer la
  resolución compartida de `desactivarUsuario` a un helper para no duplicarla.
- `reactivarUsuario`: objetivo eliminado → 404 (lo cubre el filtro de `cargarObjetivoPara`).
- `assertDestinoConversaciones`: cualquier usuario activo (`assertAssignableAdmin`) también para el
  coordinador (los accesos son iguales).
- `listTenantUsers`: añade `eliminado: { $ne: true }` (con `?activo=false` hoy traería eliminados).
  `findUsersByIds` **no** filtra: el historial sigue mostrando el nombre.
- `getCupoUsuarios(tenantId)`: `getMetricUsed('usuarios' | 'administradores')` + límites del plan del
  tenant (`getPlanLimits`, `usage.service.ts`/`plan.service.ts`); sin plan → `limite: null`.
- `getPrincipal(tenantId)` y `resetPrincipalPassword(tenantId, actorSub, password)`: `findOneScoped(User,
  tenantId, { esPrincipal: true, eliminado: { $ne: true } })` (404 si no hay); hash + `revokeUserSessions`
  en transacción; tras commit `notifySessionsRevoked` y auditoría `user.password_reset` con `actorId` =
  superadmin.

`getMetricUsed` (`usage.service.ts`) no cambia: cuenta `activo: true` y el eliminado siempre queda inactivo.

### Endpoints

| Método y ruta | Middlewares | Notas |
|---|---|---|
| `GET /api/users/cupo` | `authenticateJWT, requireTenant, authorize(['admin']), authorizeRolEmpresa(ROLES_GESTION_USUARIOS), validate(cupoSchema)` | Antes de `/:id`. |
| `DELETE /api/users/:id` | mismos que gestión + `validate(deleteUserSchema)` | Body opcional (axios `delete(url, { data })`). 200 con el usuario. |
| `PATCH /api/auth/me/password` | `authenticateJWT, requireTenant, validate(changeOwnPasswordSchema)` | `{ actual, nueva }`; responde 204 y reemite cookies. |
| `GET /api/admin/tenants/:id/principal` | `authenticateJWT, authorize(['superadmin']), validate(tenantIdParamSchema)` | Sin `requireTenant`. |
| `POST /api/admin/tenants/:id/principal/password` | `authenticateJWT, authorize(['superadmin']), validate(resetPrincipalPasswordSchema)` | `{ password }` (min 8, max 128); 204. |

### Contraseña propia (`auth.service.ts`)

```ts
export async function changeOwnPassword(
  tenantId: string, sub: string, actual: string, nueva: string,
): Promise<{ token: string; csrfToken: string }>;
```

1. `findByIdScoped(User, tenantId, sub).select('+passwordHash')`; inactivo/eliminado → 401.
2. `bcrypt.compare(actual)` falso → 400 `La contraseña actual no es correcta.`
3. Transacción: `passwordHash` nuevo + `revokeUserSessions` (devuelve o se lee `revokedAt`).
4. Firma un JWT nuevo con `iat = Math.floor(revokedAt / 1000) + 1`: `isTokenRevoked` compara con `<=`
   por segundo, así que un token firmado en el mismo segundo nacería revocado.
5. Tras commit: `notifySessionsRevoked` (corta los sockets de las otras sesiones; el cliente actual
   reconecta con la cookie nueva) y auditoría `user.password_changed`.

El controller llama a `setAuthCookies(res, token, csrfToken)`. `revokeUserSessions` pasa a devolver el
`Date` usado (cambio compatible).

### Sesión (`auth.types.ts`)

`ISessionUser` suma `esPrincipal: boolean` y `puedeGestionarAdministradores: boolean` (de BD en `login`
y `getProfile`, **no** en el JWT). El frontend los usa solo para mostrar u ocultar; el backend decide
con `cargarActor`.

### Accesos iguales (`authorize-rol-empresa.middleware.ts` y `lib/roles.ts`)

```ts
export const ROLES_DATOS_SENSIBLES: readonly RolEmpresa[] = ROLES_EMPRESA;
export const ROLES_REPORTES: readonly RolEmpresa[] = ROLES_EMPRESA;
export const ROLES_CONFIGURACION: readonly RolEmpresa[] = ROLES_EMPRESA;
export const ROLES_GESTION_USUARIOS: readonly RolEmpresa[] = ['administrador', 'coordinador']; // sin cambios
```

Se mantienen los gates (cambio reversible, cero cambios en los ~100 puntos de uso).

### Planes (`plan.validation.ts` / `plan.service.ts`)

- Create: `refine` en `limites`: `administradores <= usuarios` → 400 `Los administradores no pueden
  superar a los usuarios del plan.`
- Update (parcial): en el service, fusionar con los `limites` guardados y validar igual (400).

### Auditoría (`audit.types.ts`)

Nuevas: `user.deleted`, `user.password_changed`, `user.admin_permission_changed`.

### Migración `migrate-usuario-principal.ts`

- Por cada tenant (`Tenant.find()`, catálogo global): si `countScoped(User, t, { esPrincipal: true })`
  es 0, busca `findOneScoped(User, t, { rol: 'admin', rolEmpresa: 'administrador', activo: true,
  eliminado: { $ne: true } }).sort({ createdAt: 1 })`.
- Dry-run (default): reporte `{ tenantsSinPrincipal, aMarcar: [{ tenantId, userId, email }],
  tenantsSinAdministrador: [...] }`. `--apply`: `updateOneScoped` con `esPrincipal: true`.
- Idempotente; misma forma que `migrate-roles-empresa.ts`.

## Frontend

- **Diseño:** antes de escribir componentes, invocar `frontend-design:frontend-design`; `emil-design-eng`
  e `impeccable` no están instaladas → aplicar sus criterios a mano (estados pending/foco,
  `motion-safe`, estados vacíos, copy) y anotarlo en `tasks.md`. shadcn/ui: `AlertDialog`, `Dialog`,
  `Switch`, `Badge`, `Progress` (si no está vendorizado, instalarlo con la CLI).
- **`UsersPage.tsx`:** `CupoUsuarios` arriba; `Badge` "Principal"; menú de fila según `acciones`
  (Editar, Restablecer contraseña, Activar/Desactivar, Eliminar); la propia fila → "Cambiar mi
  contraseña". Coordinador: filtro de coordinador con "Mi equipo" / "Sin coordinador".
- **`UserFormSheet.tsx`:** roles = los que el actor puede crear (principal/admin con permiso: 3;
  admin sin permiso: coordinador y asesor; coordinador: asesor fijo). Selector de coordinador también
  para el coordinador (lista de `GET /api/users` filtrada a `rolEmpresa: 'coordinador'`). `Switch`
  "Puede gestionar otros administradores" visible solo si `yo.esPrincipal && rol === 'administrador'`.
- **`DeleteUserDialog.tsx`:** misma resolución que `DeactivateUserDialog` (`TeamResolution`,
  `OpcionCard`) cuando el 409 trae dependencias; copy destructivo y confirmación explícita.
- **`ChangeOwnPasswordDialog.tsx`:** actual, nueva, confirmación (validación local de coincidencia y
  longitud); en éxito, toast y refresco de `/auth/me`. Entrada en `NavUser` (todos los usuarios de
  empresa) y en la propia fila de Usuarios.
- **Panel Empresas:** `TenantTable` suma "Restablecer contraseña del principal" →
  `ResetPrincipalPasswordDialog` (carga `GET …/principal`, muestra nombre y email, pide la nueva dos veces).
- **Accesos:** `lib/roles.ts` con las constantes nuevas; `RequireReportes`, `RequireConfiguracion` y
  `nav-config.ts` se abren solos. Retirar `MOTIVO_DATOS_SENSIBLES` y el enmascarado de la UI si quedan sin uso.

## Notas

- **Por qué `cargarActor` en BD:** el permiso de gestionar administradores y el principal no viajan en
  el JWT para que retirarlos tenga efecto inmediato (misma razón que el equipo del coordinador en AUTH-04).
- **Por qué 403 y no 404 con el principal:** el actor ya lo ve en la lista; un 404 sería incoherente.
  Para el coordinador lo invisible sigue siendo 404 (no revelar existencia).
- **Borrado lógico ⇒ inactivo:** así cuotas, login, `assertAssignableAdmin` y asignación ya lo excluyen
  sin cambios; solo se filtran listados.
- **Tests que cambian por los accesos iguales:** los que hoy esperan 403 para coordinador/asesor en
  reportes, configuración, notas, pendientes, resumen o enmascarado (`kb.routes.test`, `reports.*`,
  `contact-note.*`, `pendiente.*`, `cliente.*`, `conversation.*`, `authorize-rol-empresa.middleware.test`).
  Se ajustan a 2xx / sin máscara; no se borran.
- **Tenants sin `adminUser`** (el alta lo permite): no tienen principal; la migración los reporta y la
  UI del superadmin muestra "Sin usuario principal".

## Verificación

- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`.
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint`; vitest en `apps/frontend`
  excluyendo `KnowledgeBasePage.test.tsx`.
- `pnpm --filter @sofiapp/api migrate:usuario-principal` (dry-run) sobre una BD con datos.
- Revisión visual light/dark como principal, admin con y sin permiso, coordinador, asesor y superadmin.
- Checklist PR de `docs/multi-tenancy.md` §9.
