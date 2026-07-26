# HU-OMNI-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Contratos exactos en `plan.md`.

## Implementación — Backend

### 1. Slice `audit` (nuevo)
- [x] `features/audit/audit.types.ts` — `AuditAccion`, `AuditEntidad`, `IAuditEvent`, `IAuditEventDocument`, `RecordAuditInput`.
- [x] `features/audit/audit.model.ts` — schema `audit_events` con `tenantId` required + index; índice `{ tenantId:1, entidad:1, entidadId:1, createdAt:-1 }`.
- [x] `features/audit/audit.service.ts` — `recordAuditEvent` (vía `createScoped`, falla suave con `logger.error`) y `listAuditEvents` (vía `findScoped`, `sort({ createdAt: -1 })`).

### 2. Slice `users` (completar)
- [x] `features/users/user.validation.ts` — `listUsersSchema` (`{ body, params, query }`).
- [x] `features/users/user.mapper.ts` — `toUserResponse` (nunca proyecta `passwordHash`).
- [x] `features/users/user.service.ts` — `listTenantUsers`, `assertAssignableAdmin` (404 si no es `admin` activo del tenant), `findUsersByIds` (una consulta, devuelve `Map`).
- [x] `features/users/user.controller.ts` — `listUsersController` (`tenantId` del token, sin `try/catch`).
- [x] `features/users/user.routes.ts` — `GET /` con la cadena `authenticateJWT · requireTenant · authorize(['admin']) · validate · asyncHandler`.
- [x] `app.ts` — `app.use('/api/users', userRoutes)` junto al resto de rutas tenant-aware.

### 3. Modelo e índices
- [x] `features/cliente/cliente.model.ts` — añadir el índice `{ tenantId: 1, asesorId: 1 }` (ya documentado en `docs/data-model.md`, faltaba en el schema).

### 4. Tiempo real
- [x] `realtime/realtime.types.ts` — añadir el evento `conversation:assigned` (con `targetUserId` y `actor`).
- [x] `realtime/realtime.publisher.ts` — enrutar por tipo en `subscribeRealtime`: `conversation:updated` al room `tenant:<id>` **y** `conversation:assigned` solo al room `asesor:<targetUserId>`.

### 5. Slice `conversation` (extender, en orden del patrón)
- [x] `conversation.types.ts` — `EstadoComercial`, `asignadoA`/`asignadoANombre`/`asignadoASubrol` en `IConversationResponse` (conservando `asesorId`), `IAssignmentResponse`.
- [x] `conversation.validation.ts` — `assignSchema`, `assignmentsSchema`; `listConversationsSchema.query` += `asignadoA` y `estado`.
- [x] `conversation.mapper.ts` — `toConversationResponse` acepta el `Map` de responsables; `toAssignmentResponse`.
- [x] `conversation.service.ts` — `buildFiltro` ampliado (`asignadoA` gana sobre `filtro`), `assignConversation` (404 · validación de destinatario · idempotencia · update · auditoría · realtime), `listAssignments`; `listConversations` resuelve nombres con **una** llamada a `findUsersByIds`.
- [x] `conversation.controller.ts` — `assignController`, `listAssignmentsController`.
- [x] `conversation.routes.ts` — `PATCH /:id/assign` y `GET /:id/assignments` con la cadena de middlewares completa y `authorize(['admin'])`.

## Implementación — Frontend

> **Antes de crear o modificar CADA componente**, invocar las skills `emil-design-eng`,
> `impeccable:impeccable` y `frontend-design:frontend-design` y aplicar sus criterios.
> Tokens semánticos únicamente (cero `bg-[#...]`), light y dark.

- [x] `lib/roles.ts` — extraer `ROL_LABEL` y `SUBROL_LABEL` desde `components/layout/NavUser.tsx` y hacer que `NavUser` los importe (sin duplicar el mapa).
- [x] `features/users/{types.ts,api.ts,hooks/useTenantUsers.ts}` — `UserDTO`, `fetchTenantUsers()` vía `apiClient`, hook de TanStack Query con `staleTime` largo.
- [x] `features/inbox/types.ts` — `asignadoA*`, `EstadoComercial`, `InboxFiltros`, `RealtimeAssignedEvent`.
- [x] `features/inbox/api.ts` — `assignConversation(id, asignadoA)`; `fetchConversations` acepta los tres filtros.
- [x] `features/inbox/hooks/useConversations.ts` — `queryKey: ['conversations', { filtro, asignadoA, estado }]`.
- [x] `features/inbox/hooks/useAssign.ts` — mutación con invalidate de `['conversations']` y `toast.error` en fallo.
- [x] `features/inbox/hooks/useInboxRealtime.ts` — `on('conversation:assigned')` → invalidate + `toast` con el nombre del actor y acción "Abrir".
- [x] `features/inbox/components/AssigneeBadge.tsx` — iniciales + nombre + subrol traducido.
- [x] `features/inbox/components/AssignMenu.tsx` — `DropdownMenu`: `Asignármela` · lista de admins con check en el actual · `Quitar asignación`; estado `pending`.
- [x] `features/inbox/components/InboxFilters.tsx` — conservar los 4 chips y añadir los `Select` de responsable y estado, escribiendo en los query params.
- [x] `features/inbox/components/ConversationList.tsx` — `AssigneeBadge` por fila.
- [x] `features/inbox/pages/InboxPage.tsx` — `AssignMenu` junto a `SofiToggle` en la cabecera del hilo; leer `asignadoA`/`estado` de `useSearchParams`.

## Implementación — Docs

- [x] `docs/data-model.md` — nueva sección `audit_events` (campos + índices) y nota en `clientes` de que `asignadoA` es el alias público de `asesorId` en la API.
- [x] `docs/api-contract.md` — `PATCH /conversations/:id/assign`, `GET /conversations/:id/assignments`, `GET /users`, los query params `asignadoA`/`estado` y el evento `conversation:assigned`.

## Tests (Vitest + MongoDB Memory Server)

> Patrón de `admin-profile.isolation.test.ts` / `usage.isolation.test.ts`.

- [x] `conversation.assign.test.ts`
  - [x] asignar a otro admin → `asesorId` persistido y DTO con `asignadoA`/`asignadoANombre`/`asignadoASubrol`.
  - [x] reasignar una conversación ya asignada (por un admin que **no** es el responsable actual) → OK.
  - [x] auto-asignarse (`asignadoA` = `sub` del token) → OK.
  - [x] desasignar (`asignadoA: null`) → `asesorId` nulo y el evento de auditoría registra `despues.asignadoA = null`.
  - [x] idempotencia: asignar el mismo valor → 200 sin `audit_events` nuevo y sin `publishRealtime`.
  - [x] conversación inexistente → 404; destinatario inexistente / no `admin` / `activo:false` → 404 y sin cambios.
  - [x] cada cambio efectivo escribe un `audit_events` con `antes`/`despues` correctos.
- [x] `conversation.filters.test.ts`
  - [x] `asignadoA=<id>`, `asignadoA=sin_asignar`, `estado=<x>` y la combinación de ambos.
  - [x] `?filtro=mios` sigue funcionando; con `asignadoA` presente, `asignadoA` gana.
- [x] `conversation.isolation.test.ts` (**aislamiento**)
  - [x] token de `tenantB`: `PATCH .../assign` y `GET .../assignments` sobre una conversación de `tenantA` → 404.
  - [x] token de `tenantB` no puede asignar a un usuario de `tenantA` → 404.
  - [x] `audit_events` de `tenantA` invisibles para `tenantB`.
  - [x] `GET /api/conversations?asignadoA=<userId de tenantA>` desde `tenantB` → lista vacía.
- [x] `user.isolation.test.ts`
  - [x] `GET /api/users` solo devuelve admins **activos** del propio tenant; nunca `passwordHash`; nunca el `superadmin`.

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores.
- [x] `pnpm --filter backend test` en verde (incluye los tests de aislamiento anteriores; 42 archivos, 241 tests).
- [x] `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.
- [x] Arrancar `app.ts`: cero errores en consola (se tocaron rutas y realtime). `worker.ts` no se
      toca en este feature (assignConversation publica desde el proceso web, no encola jobs).
- [x] **Prueba en vivo (Definition of Done):** dos sesiones de `admin` (Ana/Beto) del mismo tenant
      en contextos de navegador independientes. Ana asignó la conversación a Beto → en la sesión de
      Beto, **sin recargar**, la conversación entró a la lista y saltó el toast "Nueva conversación
      asignada — Ana Gerente te asignó a Prospecto Demo" con acción "Abrir"; verificado también
      reasignar (owner-independiente), auto-asignarse, quitar asignación y el filtro `?estado=`.
      Revisado en light y dark. Capturas tomadas en `.playwright-mcp/` y borradas al terminar.
      Datos de prueba (tenant/usuarios/cliente demo) creados en una BD Mongo separada
      (`sofiapp_dev_omni02`) y eliminados al cerrar.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo.
- [x] `spec.md` pasa a `**Estado:** implementado`.

### Hallazgo corregido durante la verificación en vivo

`middlewares/validate.middleware.ts` rechazaba con 400 cualquier `GET`/`DELETE` validado con un
schema `{ body: z.object({}) }`: `express.json()` deja `req.body` en `undefined` cuando no hay
`Content-Type: application/json`, y Zod no acepta `undefined` donde espera un objeto. Bug
preexistente (afectaba también a las rutas `GET` de `HU-OMNI-01`), nunca detectado porque los
tests existentes llaman a los `service` directamente, no a las rutas HTTP. Corregido con
`body: req.body ?? {}` antes de `safeParse` — un cambio de una línea, sin tocar ningún schema;
`pnpm --filter backend test` sigue en verde (241/241).

## Definición de "hecho"

Cualquier administrador del tenant puede pasar una conversación a otro administrador (con cualquier
subrol), quitársela o quedársela; la bandeja se filtra por responsable y por estado comercial; cada
movimiento queda registrado en `audit_events` y es consultable por conversación; y el administrador
destino ve la conversación entrar en su bandeja en tiempo real con una notificación. Todo con
`tenantId` naciendo del token y sin una sola consulta fuera del repositorio tenant-safe.
