# AUTH-03 — Plan técnico (CÓMO)

## Archivos a crear / tocar

```
apps/backend/src/
├── features/users/
│   ├── user.types.ts             # + ADMIN_SUBROLES, DTOs de alta/edición/estado, IManageUsersQuery
│   ├── user.validation.ts        # fix boolean + manage/get/create/update/estado/password (.strict())
│   ├── user.service.ts           # create/update/setEstado/resetPassword + guardas + transacción
│   ├── user.controller.ts        # controllers delgados (sin try/catch)
│   ├── user.routes.ts            # rutas nuevas + authorizeSubrol(SUBROLES_GESTION_USUARIOS)
│   ├── user.management.test.ts   # NUEVO — casos funcionales
│   └── user.isolation.test.ts    # AMPLIAR — cruces de tenant
├── features/auth/
│   ├── session-revocation.model.ts  # NUEVO — { tenantId, userId, revokedAt, expiraEn } + TTL
│   ├── session.service.ts           # NUEVO — revokeUserSessions / isTokenRevoked
│   └── session.service.test.ts      # NUEVO
├── features/conversation/conversation.service.ts  # + countAssignedConversations, moveAssignedConversations
├── features/flow/flow.service.ts                  # + countFlowsReferencingUser
├── features/flow/flow.runtime.service.ts          # 'asignar_asesor' tolera asesor inactivo
├── middlewares/authenticate-jwt.middleware.ts     # async + isTokenRevoked
├── middlewares/authorize-subrol.middleware.ts     # + SUBROLES_GESTION_USUARIOS, puedeGestionarUsuarios
└── realtime/
    ├── internal-bus.ts       # canal 'session:revoke' (+ tipo de mensaje con userId)
    ├── socket.gateway.ts     # chequeo de revocación en handshake + disconnectSockets
    └── realtime.types.ts     # evento 'conversations:reassigned'

apps/frontend/src/
├── features/users/
│   ├── api.ts · types.ts
│   ├── hooks/ useManageUsers · useUser · useCreateUser · useUpdateUser · useSetUserEstado · useResetUserPassword
│   ├── components/ UsersTable · UserFormSheet · DeactivateUserDialog · ResetPasswordDialog
│   └── UsersPage.tsx
├── lib/roles.ts                          # + puedeGestionarUsuarios, SUBROLES_GESTION_USUARIOS
├── components/RequireGestionUsuarios.tsx # guard (patrón de RequireReportes.tsx)
├── components/layout/nav-config.ts       # ítem "Usuarios" en Configuración
├── router.tsx                            # /settings/users
└── (inbox) listener de 'conversations:reassigned' → invalidar queries de la bandeja

docs/
├── adr/0016-gestion-usuarios-y-revocacion.md   # NUEVO
├── product.md · domain.md · data-model.md · api-contract.md
```

## Contratos

### `user.types.ts`
```ts
export const ADMIN_SUBROLES = ['director', 'manager', 'coordinator', 'secretary'] as const;
export type AdminSubrol = (typeof ADMIN_SUBROLES)[number];

export interface ICreateUserDto { nombre: string; email: string; password: string; subrol: AdminSubrol }
export interface IUpdateUserDto { nombre?: string; email?: string; subrol?: AdminSubrol }
export type MoverConversaciones =
  | { accion: 'reasignar'; destinoId: string }
  | { accion: 'desasignar' };
export interface ISetEstadoDto { activo: boolean; conversaciones?: MoverConversaciones }
export interface IManageUsersQuery { activo?: boolean; subrol?: AdminSubrol; q?: string }
export const USER_HAS_ASSIGNED_CONVERSATIONS = 'USER_HAS_ASSIGNED_CONVERSATIONS';
```
`IUserResponse` suma `createdAt` (para la tabla). `user.model.ts` no cambia de esquema: `subrol` sigue
opcional en Mongo (el propietario no lo tiene); la obligatoriedad vive en Zod del alta.

### `user.validation.ts`
- **Fix** `listUsersSchema`: `activo: z.enum(['true','false']).default('true').transform((v) => v === 'true')`.
- `manageUsersSchema.query`: `activo: z.enum(['true','false','todos']).default('todos')` → `boolean | undefined`;
  `subrol: z.enum(ADMIN_SUBROLES).optional()`; `q: z.string().trim().max(100).optional()`.
- `createUserSchema.body` `.strict()`: `nombre` (trim, 2–100), `email` (`z.email()`, trim, lowercase),
  `password` (8–128), `subrol: z.enum(ADMIN_SUBROLES)`.
- `updateUserSchema.body` `.strict()` con los tres campos opcionales + `.refine` (al menos uno).
- `setEstadoSchema.body` `.strict()`: `activo: z.boolean()`, `conversaciones?:
  z.discriminatedUnion('accion', [{ accion: 'reasignar', destinoId: objectId }, { accion: 'desasignar' }])`.
- `resetPasswordSchema.body` `.strict()`: `password` (8–128).
- `params`: `id` validado como ObjectId (helper existente en `utils/validation.ts`).

### Endpoints (`user.routes.ts`)
Base de todas: `authenticateJWT, requireTenant, authorize(['admin'])`. `gestion = authorizeSubrol(SUBROLES_GESTION_USUARIOS)`.

| Método y ruta | Middleware extra | Service |
|---|---|---|
| `GET /` | — | `listTenantUsers` (sin cambios de contrato) |
| `GET /manage` | `gestion` | `listManageableUsers` |
| `GET /:id` | `gestion` | `getTenantUser` |
| `POST /` | `gestion` | `createTenantUser` |
| `PATCH /:id` | `gestion` | `updateTenantUser` |
| `PATCH /:id/estado` | `gestion` | `setTenantUserEstado` |
| `POST /:id/password` | `gestion` | `resetTenantUserPassword` |

`/manage` se declara **antes** de `/:id`. El router ya está montado en `app.ts` (`/api/users`); verificar.

### `user.service.ts` (todas reciben `tenantId` del token y `actor: SafeUser`)
- Reutiliza `findScoped`, `findByIdScoped`, `createScoped`, `findOneAndUpdateScoped`, `countScoped`
  (`repositories/base.repository.ts`), `assertWithinQuota` (`features/usage/usage.service.ts`),
  `assertAssignableAdmin` (mismo archivo), `recordAuditEvent` (`features/audit/audit.service.ts`).
- **Transacciones** con `mongoose.startSession()` + `withTransaction`, como `tenant.service.ts:111`.
  Alta y reactivación: `assertWithinQuota('usuarios')` + `assertWithinQuota('administradores')` dentro
  de la transacción.
- **Guardas:**
  - `esPropietario(u) = u.rol === 'admin' && !u.subrol`; `esGestor(u) = esPropietario(u) || u.subrol === 'director'`.
  - `assertPuedeGestionar(actor, objetivo)`: si el objetivo es propietario y el actor no lo es → 403.
  - `assertNoEsUnoMismo(actor, objetivoId, operacion)` para desactivar y cambiar el propio subrol → 409.
  - `assertNoUltimoGestor(tenantId, objetivo, cambio)`: si el objetivo es gestor y el cambio lo saca de
    gestor (desactivar o subrol ≠ `director`), `countScoped(User, tenantId, { activo: true, _id: { $ne },
    $or: [{ subrol: { $exists: false } }, { subrol: null }, { subrol: 'director' }] }) === 0` → 409.
- **Email duplicado:** capturar el error Mongo `11000` en el service y relanzar
  `AppError('Ya existe un usuario con ese email.', 409)`.
- **`setTenantUserEstado(tenantId, actor, id, dto)`**, al desactivar:
  1. guardas (jerarquía, uno mismo, último gestor);
  2. `asignadas = countAssignedConversations(tenantId, id)`; si `> 0` y no hay `dto.conversaciones` →
     `AppError(msg, 409, { code, asignadas, flujos: countFlowsReferencingUser(tenantId, id) })`;
  3. si es `reasignar`: `assertAssignableAdmin(tenantId, destinoId)` y `destinoId !== id`;
  4. en una transacción: `moveAssignedConversations` → `findOneAndUpdateScoped(User, …, { activo: false })`
     → `revokeUserSessions(tenantId, id, session)`;
  5. tras confirmar: auditoría (`user.deactivated` y, si hubo movimiento, `user.conversations_moved`
     `{ cantidad, destinoId }`), `publishRealtime({ type: 'conversations:reassigned', … })` y
     `publicarInterno('session:revoke', { tenantId, userId })`.
- `updateTenantUser`: si cambia `subrol` → `revokeUserSessions` + auditoría `user.subrol_changed`
  `{ antes, despues }`; el resto → `user.updated` con los campos cambiados (nunca el password).
- `resetTenantUserPassword`: `bcrypt.hash(password, 10)` + `revokeUserSessions` + `user.password_reset`.

### Revocación de sesión (`features/auth/`)
```ts
// session-revocation.model.ts
{ tenantId: ObjectId (required, index), userId: ObjectId (required), revokedAt: Date, expiraEn: Date }
SessionRevocationSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
SessionRevocationSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 }); // TTL
```
- `SESSION_REVOCATION_TTL_MS = 7 días`, que debe ser ≥ `JWT_EXPIRES_IN` (8h por defecto). Se documenta en el ADR.
- `revokeUserSessions(tenantId, userId, session?)`: upsert con `findOneAndUpdateScoped`
  `{ revokedAt: now, expiraEn: now + TTL }`.
- `isTokenRevoked(tenantId, userId, iat): Promise<boolean>`: `findOneScoped`; revocado si
  `iat * 1000 <= revokedAt.getTime()`. **Sin documento = válido.**
- Superadmin (`tenantId: null`) no se consulta: no se gestiona desde un tenant.

### `authenticate-jwt.middleware.ts`
Pasa a `async` (Express 5 propaga el rechazo). Tras `jwt.verify`, si el payload trae `tenantId` y
`isTokenRevoked(...)` → `401 { message: 'Sesión revocada.' }`. No consulta `User`: los 37 tests que
firman tokens con `sub` inexistente siguen pasando.

### Tiempo real
- `internal-bus.ts`: canal `SESSION_REVOKE_CHANNEL = 'session:revoke'` con mensaje `{ tenantId, userId }`
  (tipar el mensaje por canal o añadir un tipo propio; no reutilizar `MensajeInvalidacion` a la fuerza).
- `socket.gateway.ts`: el handshake llama `isTokenRevoked`; un suscriptor de `session:revoke` ejecuta
  `io.in('asesor:<userId>').disconnectSockets(true)`.
- `realtime.types.ts`: `{ type: 'conversations:reassigned'; tenantId; conversationIds: string[]; asesorId: string | null }`,
  emitido solo al room `tenant:<tenantId>`.

### Conversaciones y flujos
- `countAssignedConversations(tenantId, userId)` → `countScoped(Cliente, tenantId, { asesorId })`.
  No existe estado "cerrada" en `Cliente`, así que cuentan **todas** las asignadas.
- `moveAssignedConversations(tenantId, fromId, destinoId | null, session)` → lee los ids con
  `findScoped(...).select('_id')` y aplica `updateManyScoped(Cliente, tenantId, { asesorId: fromId }, { asesorId: destino })`.
- `countFlowsReferencingUser(tenantId, userId)` en `flow.service.ts`: `countScoped(Flow, …)` sobre los
  efectos `asignar_asesor.asesorId` y `handoff.notificarAsesorId` (resolver la ruta exacta dentro del grafo en `flow.model.ts`).
- `flow.runtime.service.ts` `case 'asignar_asesor'`: envolver `assignConversation` en `try/catch` con
  `logger.warn`, como el caso `handoff` del mismo archivo.

### Frontend
- `api.ts`: `fetchManageUsers(query)`, `fetchUser(id)`, `createUser`, `updateUser`, `setUserEstado`,
  `resetUserPassword` sobre el `apiClient` único. `fetchTenantUsers` no cambia.
- Hooks TanStack Query con clave `['users', …]`; las mutaciones invalidan `['users']`. Las de estado
  también invalidan las queries de la bandeja.
- `lib/roles.ts`: `puedeGestionarUsuarios(user)` = `rol === 'admin' && (!subrol || subrol === 'director')`.
- `RequireGestionUsuarios` dentro de `RequireRole`, como `RequireReportes.tsx`. Ítem en `nav-config.ts`
  con `subroles: SUBROLES_GESTION_USUARIOS`. Ojo: `visiblePara` ya deja ver el ítem a un admin sin subrol.
- **UI (shadcn/ui ya vendorizado):** `Table` + `Badge` (estado/subrol) + filtros con `Input`/`Select`;
  `Sheet` para alta/edición; `AlertDialog` para desactivar que, ante el 409, muestra N conversaciones
  y M flujos, con `RadioGroup` (reasignar / mover a bandeja sin asignar) y `Select` de admins activos
  (excluye al usuario); `Dialog` para restablecer contraseña; `sonner` para el feedback. Subroles
  traducidos (Director, Gerente, Coordinador, Secretaria). El usuario propio no muestra acción de
  desactivar; las acciones sobre el propietario se ocultan para un `director`.

## Notas

- `rol` y `tenantId` nunca se escriben desde la entrada: Zod `.strict()` los rechaza y `createScoped`
  fuerza el `tenantId`.
- El 409 por email duplicado no indica en qué tenant existe (ADR 0003: email único global).
- La desactivación con movimiento de conversaciones es **una sola llamada** para evitar la carrera
  "muevo → alguien le asigna una nueva → desactivo".
- La lista de revocación añade una lectura indexada por petición sobre una colección casi vacía. Si pesa,
  se puede cachear en memoria por unos segundos (fuera del MVP).
- Docs a corregir: `product.md:37` aún dice que el subrol no tiene efecto en permisos (ya lo tiene desde
  ADR 0006/0011); documentar gestor, jerarquía y revocación.
- Al tocar `apps/frontend`, invocar antes `emil-design-eng`, `impeccable:impeccable` y
  `frontend-design:frontend-design` (regla 7 del `CLAUDE.md` raíz).

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck   # tsc --noEmit
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint
```

Prueba manual: como propietario, crear un `coordinator` → iniciar sesión con él en otra ventana →
asignarle una conversación → desactivarlo (409 → reasignar) → la otra ventana pierde el socket y la
siguiente petición devuelve 401 → el usuario no puede volver a iniciar sesión.
