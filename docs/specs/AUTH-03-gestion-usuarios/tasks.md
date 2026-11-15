# AUTH-03 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.

## Implementación — backend

- [x] `features/users/user.types.ts`: `ADMIN_SUBROLES`, `CreateUserDTO`, `UpdateUserDTO`,
      `MoverConversaciones`, `SetUserEstadoDTO`, `IManageUsersQuery`, `USER_HAS_ASSIGNED_CONVERSATIONS`;
      `createdAt` en `IUserResponse` y en `toUserResponse`.
- [x] `features/auth/session-revocation.model.ts`: schema + índice único `{ tenantId, userId }` + TTL `{ expiraEn }`.
- [x] `features/auth/session.service.ts`: `revokeUserSessions`, `isTokenRevoked`, `notifySessionsRevoked` (repositorio scoped).
- [x] `features/users/user.validation.ts`: fix del boolean de `listUsersSchema` + schemas `manage`, `get`,
      `create`, `update`, `setEstado`, `resetPassword` (`.strict()`, `id` ObjectId).
- [x] `middlewares/authorize-subrol.middleware.ts`: `SUBROLES_GESTION_USUARIOS = ['director']` + `puedeGestionarUsuarios`.
- [x] Conversaciones: `countAssignedConversations` y `moveAssignedConversations` (con `session`).
      _Desviación:_ viven en `features/conversation/conversation-reassign.service.ts` y no en
      `conversation.service.ts`, para evitar un ciclo de imports (`conversation.service` ya importa `user.service`).
- [x] `features/flow/flow.service.ts`: `countFlowsReferencingUser`. `flow.runtime.service.ts`: `try/catch` + `warn` en `asignar_asesor`.
- [x] `features/users/user.service.ts`: `listManageableUsers`, `getTenantUser`, `createTenantUser`,
      `updateTenantUser`, `setTenantUserEstado`, `resetTenantUserPassword` + guardas (jerarquía, uno mismo,
      último gestor) + cuotas + transacciones (`mongoose.connection.transaction`) + auditoría + mapeo del `11000` a 409.
      _Añadido:_ restablecer la **propia** contraseña por esta vía → 409 (cerraría la sesión del propio gestor).
- [x] `repositories/base.repository.ts`: `createScoped` acepta `SaveOptions` (la `session` de la transacción del alta). Retrocompatible.
- [x] `features/users/user.controller.ts`: un controller delgado por endpoint (sin `try/catch`).
- [x] `features/users/user.routes.ts`: `/manage` antes de `/:id`, gate `gestion` en las rutas de gestión.
      Montaje en `app.ts` ya existía (`/api/users`).
- [x] `middlewares/authenticate-jwt.middleware.ts`: `async` + `isTokenRevoked` → 401 `Sesión revocada.`
- [x] `realtime/internal-bus.ts` (canal `session:revoke`, bus genérico por tipo de mensaje),
      `socket.gateway.ts` (handshake + `subscribeSessionRevocations`, montado en `app.ts` fuera de tests),
      `realtime.types.ts` (`conversations:reassigned`).
- [x] `features/audit/audit.types.ts`: acciones `user.*` y entidad `user`.

## Implementación — frontend

> Antes de escribir componentes: invocar `emil-design-eng`, `impeccable:impeccable` y
> `frontend-design:frontend-design`.
> _Desviación aprobada por el usuario:_ en la sesión solo estaba instalada `frontend-design` (invocada).
> `emil-design-eng` e `impeccable` no existen en el repo ni en el usuario; sus criterios (estados de
> pending/foco, `motion-safe`, estados vacíos y de error, copy) se aplicaron a mano.

- [x] `lib/roles.ts`: `SUBROLES_GESTION_USUARIOS` + `puedeGestionarUsuarios` + `esPropietario`.
- [x] `components/RequireGestionUsuarios.tsx`, ítem "Usuarios" en `nav-config.ts` (Configuración; antes
      `disabled`) y ruta `/settings/users` en `router.tsx`.
- [x] `features/users/types.ts` + `api.ts` (sin romper `fetchTenantUsers`) + `index.ts`.
- [x] Hooks en `hooks/useManageUsers.ts`: `useManageUsers`, `useCreateUser`, `useUpdateUser`,
      `useSetUserEstado`, `useResetUserPassword`. _Sin `useUser`:_ la pantalla no necesita el detalle aparte.
- [x] Componentes: `UserFormSheet`, `DeactivateUserDialog` (maneja el 409: reasignar / mover a la bandeja
      sin asignar), `ResetPasswordDialog`; `pages/UsersPage` (la tabla vive en la página, no en un `UsersTable` aparte).
- [x] Bandeja: `useInboxRealtime` escucha `conversations:reassigned` e invalida sus queries.
- [ ] Revisión visual en light y dark con la app corriendo. **Pendiente:** en esta sesión no había MongoDB
      ni Redis locales para levantar el backend. Los componentes usan solo tokens semánticos y shadcn.

## Docs

- [x] `docs/adr/0016-gestion-usuarios-y-revocacion.md`.
- [x] `docs/product.md`, `docs/domain.md`, `docs/data-model.md` (`session_revocations`),
      `docs/api-contract.md` (endpoints, 409 con `details`, eventos de tiempo real), `apps/frontend/CLAUDE.md` (RBAC).
- [x] Índice de ADRs (`docs/adr/README.md`).

## Tests (Vitest)

- [x] `user.management.isolation.test.ts` (aislamiento de la gestión; el `user.isolation.test.ts` original se conserva):
  - [x] `GET /:id`, `PATCH /:id`, `PATCH /:id/estado`, `POST /:id/password` sobre un usuario de otro tenant → 404.
  - [x] `POST /` con `tenantId` en el body → 400; el usuario creado pertenece al tenant del token.
  - [x] Reasignar conversaciones a un usuario de otro tenant → 404 y sin cambios.
  - [x] Una revocación en el tenant A no invalida tokens de usuarios del tenant B.
  - [x] `/manage` nunca devuelve usuarios de otro tenant, el superadmin ni `passwordHash`.
- [x] `user.management.test.ts`:
  - [x] Alta: `subrol` requerido (400), `rol`/`tenantId` en body (400), email duplicado en otro tenant → 409 sin revelar el tenant, cuota → 429.
  - [x] Edición de nombre/subrol; cambiar subrol revoca las sesiones.
  - [x] Gate: `manager`, `coordinator` y `secretary` → 403; `director` y propietario → OK; selector abierto a todos.
  - [x] Jerarquía: un `director` no puede tocar al propietario; nadie se desactiva ni se cambia el subrol a sí mismo.
  - [x] No se puede desactivar ni degradar al último gestor activo → 409.
  - [x] Desactivar con conversaciones asignadas y sin `conversaciones` → 409 con `asignadas` y `flujos`, sin cambios.
  - [x] `reasignar` (destino válido, inactivo → 404, mismo usuario → 400) y `desasignar`: cero `Cliente` restantes con ese `asesorId`.
  - [x] Reactivar valida cuota (429 sin cupo) y audita.
  - [x] Restablecer contraseña: el login funciona con la nueva y el token anterior → 401; la propia → 409.
  - [x] Se registran los eventos de auditoría esperados.
  - [x] `GET /api/users?activo=false` devuelve inactivos (regresión del bug de coerción).
- [x] `session.service.test.ts` + middleware: token anterior a la revocación → 401; posterior → OK; sin revocación → OK; superadmin no se consulta.
- [x] `flow.runtime.service.test.ts`: `asignar_asesor` con asesor inactivo no lanza.
- [x] Tests existentes siguen en verde con el middleware async.
- [x] Frontend `UsersPage.test.tsx`: sin acciones sobre uno mismo, director sin acciones sobre el
      propietario, desactivar directo y flujo del 409 → mover a la bandeja.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde.
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.
- [x] Tests del frontend: los del feature en verde. _Ojo:_ `KnowledgeBasePage.test.tsx` se cuelga con
      `Maximum call stack size exceeded` **también sobre `develop` sin estos cambios** (verificado con
      stash); es preexistente y ajeno a AUTH-03.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [x] `git status` sin capturas `*.png`/`*.jpg` ajenas al cambio.

## Definición de "hecho"

El gestor de cada empresa administra su equipo desde `/settings/users`: crea, edita, asigna subrol,
restablece contraseñas y activa o desactiva usuarios. Ningún endpoint permite tocar usuarios de otro
tenant ni escalar privilegios. Desactivar o degradar a alguien corta su sesión en el acto, y ninguna
conversación queda asignada a un usuario inactivo.
